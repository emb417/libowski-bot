import cron from "node-cron";
import {
  fetchLibraryData,
  transformToTitles,
  loginToLibrary,
  fetchHolds,
} from "./LibraryApiService.js";
import {
  getAvailableBibItems,
  getLocationByName,
} from "./AvailabilityService.js";
import {
  updateLibraryItems,
  getLibraryItemsByType,
  getUsersWithItemInWishlist,
  getUsersWithLinkedCards,
  shouldNotifyUser,
  updateUserNotificationTimestamp,
  updateItemAvailability,
  markItemAsNotified,
} from "./database.js";
import { ItemSingleMessage } from "./ItemSingleMessage.js";
import logger from "../utils/logger.js";

async function runAvailableNowTask() {
  logger.info("Running availability refresh cron job.");

  try {
    // 1. Fetch and transform library data
    const libraryData = await fetchLibraryData("available now");
    const refreshedTitles = transformToTitles(libraryData, "available now");

    // 2. Update database with refreshed titles
    await updateLibraryItems(refreshedTitles, "available now");

    // 3. Get all available now items and check detailed availability
    const availableItems = await getLibraryItemsByType("available now");
    const availableBibItems = await getAvailableBibItems(availableItems);

    // 4. Process availability and match against wishlists
    const userNotifications = {};
    const newlyAvailable = [];

    if (availableBibItems.length > 0) {
      for (const bibItem of availableBibItems) {
        const location = getLocationByName(bibItem.branch.name);
        if (!location) continue;

        const dbItem = availableItems.find((item) => item.id === bibItem.id);
        if (!dbItem) continue;

        // Update availability in database
        await updateItemAvailability(dbItem.id, location.code, location.name);

        // Find users with this item in their wishlist
        const matchingUsers = await getUsersWithItemInWishlist(dbItem);

        if (matchingUsers.length > 0) {
          for (const user of matchingUsers) {
            const shouldNotify = await shouldNotifyUser(
              user.id,
              dbItem.id,
              location.code,
            );

            if (shouldNotify) {
              logger.trace(
                `${dbItem.title} now available at ${location.name} for user ${user.username}.`,
              );

              await updateUserNotificationTimestamp(
                user.id,
                dbItem.id,
                location.code,
              );

              if (!userNotifications[user.id]) {
                userNotifications[user.id] = {
                  userId: user.id,
                  username: user.username,
                  items: [],
                };
              }

              userNotifications[user.id].items.push({
                title: dbItem.title,
                subtitle: dbItem.subtitle,
                location: location.name,
                url: dbItem.url,
                image: dbItem.image,
                format: dbItem.format,
                publicationYear: dbItem.publicationYear,
                description: dbItem.description,
                id: dbItem.id,
              });

              newlyAvailable.push(dbItem);
            }
          }
        }
      }

      logger.debug(`${newlyAvailable.length} newly available items found.`);
      logger.debug(`${Object.keys(userNotifications).length} users to notify.`);
    }

    // 5. Send notifications
    if (Object.keys(userNotifications).length > 0) {
      for (const [userId, notificationData] of Object.entries(
        userNotifications,
      )) {
        await ItemSingleMessage.sendToUser(
          userId,
          notificationData.username,
          notificationData.items,
          {
            titlePrefix: "📀 ",
            color: "#00FF00",
            showLocation: true,
          },
        );

        logger.info(
          `Sent notification to ${notificationData.username} for ${notificationData.items.length} items`,
        );
      }
    } else {
      logger.info("No new titles available now matching user wishlists.");
    }

    return newlyAvailable;
  } catch (error) {
    logger.error("Error refreshing available now items:", error);
    throw error;
  }
}

async function runOnOrderTask() {
  logger.info("Running on-order refresh cron job.");

  try {
    // 1. Fetch and transform library data
    const libraryData = await fetchLibraryData("on order");
    const refreshedTitles = transformToTitles(libraryData, "on order");

    // 2. Update database with refreshed titles
    await updateLibraryItems(refreshedTitles, "on order");

    // 3. Get all on order items
    const onOrderTitles = await getLibraryItemsByType("on order");

    // 4. Find new items that haven't been notified yet
    const newOnOrderTitles = onOrderTitles.filter((title) => !title.notifyDate);

    // 5. Mark as notified
    for (const item of newOnOrderTitles) {
      await markItemAsNotified(item.id);
    }

    logger.debug(`${newOnOrderTitles.length} new on order titles found.`);

    // 6. Send channel notification if there are new items
    if (newOnOrderTitles.length > 0) {
      await ItemSingleMessage.sendToChannel(
        newOnOrderTitles.map((item) => ({
          title: item.title,
          subtitle: item.subtitle,
          url: item.url,
          image: item.image,
          format: item.format,
          publicationYear: item.publicationYear,
          description: item.description,
          id: item.id,
        })),
        {
          titlePrefix: "🚚 ",
          color: "#FFA500",
          showLocation: false,
        },
      );

      logger.info(
        `Sent channel notification for ${newOnOrderTitles.length} new on order items`,
      );
    } else {
      logger.info("No new titles on order.");
    }

    return newOnOrderTitles;
  } catch (error) {
    logger.error("Error refreshing on order items:", error);
    throw error;
  }
}

async function runHoldsReadyTask() {
  logger.info("Running holds ready check cron job.");

  try {
    const usersWithCards = await getUsersWithLinkedCards();

    for (const user of usersWithCards) {
      try {
        const sessionCookies = await loginToLibrary(user.cardNumber, user.pin);
        const { holds } = await fetchHolds(sessionCookies);

        const readyHolds = holds.filter(
          (hold) => hold.holdStatus === "READY_FOR_PICKUP",
        );

        for (const hold of readyHolds) {
          const shouldNotify = await shouldNotifyUser(
            user.id,
            hold.id,
            "READY_FOR_PICKUP",
          );
          if (!shouldNotify) continue;

          await updateUserNotificationTimestamp(
            user.id,
            hold.id,
            "READY_FOR_PICKUP",
          );

          await ItemSingleMessage.sendToUser(user.id, user.username, [hold], {
            titlePrefix: "📬 ",
            color: "#2ECC71",
            showHoldStatus: true,
          });

          logger.info(
            `Notified ${user.username} that "${hold.title}" is ready for pickup`,
          );
        }
      } catch (error) {
        logger.warn(
          { err: error },
          `Failed holds check for user ${user.username}`,
        );
      }
    }
  } catch (error) {
    logger.error("Error running holds ready task:", error);
    throw error;
  }
}

export function scheduleCronJobs() {
  logger.info("...and scheduling cron jobs...");

  const availabilityCronJob = cron.schedule(
    process.env.AVAILABILITY_SCHEDULE || "*/15 8-18 * * *",
    runAvailableNowTask,
    { scheduled: true },
  );

  const onOrderCronJob = cron.schedule(
    process.env.ON_ORDER_SCHEDULE || "0 */6 * * *",
    runOnOrderTask,
    { scheduled: true },
  );

  const holdsReadyCronJob = cron.schedule(
    process.env.HOLDS_READY_SCHEDULE || "*/15 8-18 * * *",
    runHoldsReadyTask,
    { scheduled: true },
  );

  logger.info("Cron jobs scheduled.");

  return { availabilityCronJob, onOrderCronJob, holdsReadyCronJob };
}
