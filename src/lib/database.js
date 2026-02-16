import "dotenv/config";
import { JSONFilePreset } from "lowdb/node";
import logger from "../utils/logger.js";

const DB_PATH = "/app/data/db.json";

async function initDB() {
  const db = await JSONFilePreset(DB_PATH, { users: [], libraryItems: [] });
  await db.read();

  if (!db.data) db.data = { libraryItems: [], users: [] };
  if (!db.data.libraryItems) db.data.libraryItems = [];
  if (!db.data.users) db.data.users = [];

  return db;
}

// ============================================================================
// LIBRARY ITEMS - Read Operations
// ============================================================================

export async function getBestSellers() {
  const db = await initDB();
  const items = db.data.libraryItems.filter(
    (item) => item.type === "available now",
  );
  logger.info(`${items.length} db best seller items found.`);
  return items;
}

export async function getOnOrder() {
  const db = await initDB();
  const items = db.data.libraryItems.filter((item) => item.type === "on order");
  logger.info(`${items.length} db on order items found.`);
  return items;
}

export async function getLibraryItemById(itemId) {
  const db = await initDB();
  return db.data.libraryItems.find((item) => item.id === itemId);
}

export async function getLibraryItemsByType(type) {
  const db = await initDB();
  return db.data.libraryItems.filter((item) => item.type === type);
}

// ============================================================================
// LIBRARY ITEMS - Write Operations
// ============================================================================

export async function updateLibraryItems(refreshedTitles, type) {
  const db = await initDB();

  // Remove items older than 30 days
  db.data.libraryItems = db.data.libraryItems.filter(
    (item) =>
      item.updateDate > Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60,
  );

  // Keep items of other types
  const otherExistingLibraryItems = db.data.libraryItems.filter(
    (item) => item.type !== type,
  );

  // Merge refreshed titles
  db.data.libraryItems = [
    ...otherExistingLibraryItems,
    ...refreshedTitles.map((refreshedTitle) => {
      const existingItem = db.data.libraryItems.find(
        (item) => item.id === refreshedTitle.id,
      );

      if (existingItem) {
        return { ...existingItem, ...refreshedTitle };
      }

      refreshedTitle.createDate = Math.floor(Date.now() / 1000);
      return refreshedTitle;
    }),
  ];

  await db.write();
  logger.debug(
    `Updated ${refreshedTitles.length} library items of type: ${type}`,
  );
}

export async function updateItemAvailability(
  itemId,
  locationCode,
  locationName,
) {
  const db = await initDB();

  const itemIndex = db.data.libraryItems.findIndex(
    (item) => item.id === itemId,
  );

  if (itemIndex === -1) {
    logger.warn(`Item ${itemId} not found in database`);
    return null;
  }

  const item = db.data.libraryItems[itemIndex];

  if (!item.availability) {
    item.availability = {};
  }
  if (!item.availability[locationCode]) {
    item.availability[locationCode] = {};
  }

  item.availability[locationCode].location = locationName;
  item.availability[locationCode].lastAvailableTime = Math.floor(
    Date.now() / 1000,
  );

  db.data.libraryItems[itemIndex] = item;
  await db.write();

  return item;
}

export async function markItemAsNotified(itemId) {
  const db = await initDB();

  const itemIndex = db.data.libraryItems.findIndex(
    (item) => item.id === itemId,
  );

  if (itemIndex !== -1) {
    db.data.libraryItems[itemIndex].notifyDate = Math.floor(Date.now() / 1000);
    await db.write();
  }
}

// ============================================================================
// WISHLIST - Read Operations
// ============================================================================

export async function getWishListItems(userId) {
  const db = await initDB();
  const user = db.data.users.find((u) => u.id === userId);

  if (!user || !user.wishlist) {
    logger.info(`No wishlist found for user ID ${userId}`);
    return [];
  }

  logger.info(
    `Retrieved ${user.wishlist.length} wishlist items for user ${user.username}`,
  );
  return user.wishlist;
}

export async function getUsersWithItemInWishlist(item) {
  const db = await initDB();
  const matchingUsers = [];

  for (const user of db.data.users) {
    if (!user.wishlist || user.wishlist.length === 0) continue;

    const hasMatch = user.wishlist.some((wishlistItem) =>
      item.title.toLowerCase().includes(wishlistItem.toLowerCase()),
    );

    if (hasMatch) {
      matchingUsers.push(user);
    }
  }

  return matchingUsers;
}

export async function getAllUsers() {
  const db = await initDB();
  return db.data.users;
}

// ============================================================================
// WISHLIST - Write Operations
// ============================================================================

export async function addWishListItem(user, title) {
  const db = await initDB();

  let existingUser = db.data.users.find((u) => u.id === user.id);

  if (existingUser) {
    if (!existingUser.wishlist) {
      existingUser.wishlist = [];
    }

    if (existingUser.wishlist.includes(title)) {
      logger.info(
        `Title "${title}" already exists in wishlist for user ${user.username}`,
      );
      return {
        user: existingUser,
        totalItems: existingUser.wishlist.length,
        alreadyExists: true,
      };
    }

    existingUser.wishlist.push(title);
    logger.info(`Added "${title}" to wishlist for user ${user.username}`);
  } else {
    const newUser = {
      id: user.id,
      username: user.username,
      wishlist: [title],
    };

    db.data.users.push(newUser);
    existingUser = newUser;
    logger.info(
      `Created new user ${user.username} and added "${title}" to wishlist`,
    );
  }

  await db.write();

  return {
    user: existingUser,
    totalItems: existingUser.wishlist.length,
    alreadyExists: false,
  };
}

export async function removeWishListItem(userId, title) {
  const db = await initDB();

  const user = db.data.users.find((u) => u.id === userId);

  if (!user || !user.wishlist) {
    throw new Error("User or wishlist not found");
  }

  const index = user.wishlist.indexOf(title);
  if (index === -1) {
    throw new Error("Title not found in wishlist");
  }

  user.wishlist.splice(index, 1);
  await db.write();

  logger.info(`Removed "${title}" from wishlist for user ${user.username}`);

  return {
    user: user,
    totalItems: user.wishlist.length,
  };
}

// ============================================================================
// USER NOTIFICATIONS - Tracking
// ============================================================================

export async function shouldNotifyUser(userId, itemId, locationCode) {
  const db = await initDB();
  const user = db.data.users.find((u) => u.id === userId);

  if (!user) return false;

  if (!user.notifications) {
    return true; // First time notification
  }

  const notificationKey = `${itemId}_${locationCode}`;
  const lastNotified = user.notifications[notificationKey];

  if (!lastNotified) {
    return true; // Never notified for this item/location combo
  }

  const notifyDelay = parseInt(process.env.NOTIFY_DELAY) || 86400000; // default 24h
  const timeSinceLastNotification = Date.now() - lastNotified * 1000;

  return timeSinceLastNotification > notifyDelay;
}

export async function updateUserNotificationTimestamp(
  userId,
  itemId,
  locationCode,
) {
  const db = await initDB();
  const userIndex = db.data.users.findIndex((u) => u.id === userId);

  if (userIndex === -1) return;

  if (!db.data.users[userIndex].notifications) {
    db.data.users[userIndex].notifications = {};
  }

  const notificationKey = `${itemId}_${locationCode}`;
  db.data.users[userIndex].notifications[notificationKey] = Math.floor(
    Date.now() / 1000,
  );

  await db.write();
}
