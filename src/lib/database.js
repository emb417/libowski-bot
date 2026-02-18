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
  logger.info(`The Dude found ${items.length} best seller items in the db.`);
  return items;
}

export async function getOnOrder() {
  const db = await initDB();
  const items = db.data.libraryItems.filter((item) => item.type === "on order");
  logger.info(`The Dude found ${items.length} on order items in the db.`);
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
    `The Dude updated ${refreshedTitles.length} library items of type: ${type}`,
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
    logger.warn(`The Dude could not find Item ${itemId} in the db.`);
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
    logger.info(`The Dude did not find a wishlist for user ID ${userId}`);
    return [];
  }

  logger.info(`The Dude retrieved ${user.wishlist.length} wishlist items.`);
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
        `The Dude found another Title "${title}" already in ${user.username}'s wishlist.`,
      );
      return {
        user: existingUser,
        totalItems: existingUser.wishlist.length,
        alreadyExists: true,
      };
    }

    existingUser.wishlist.push(title);
    logger.info(`The Dude added "${title}" to ${user.username}'s wishlist.`);
  } else {
    const newUser = {
      id: user.id,
      username: user.username,
      wishlist: [title],
    };

    db.data.users.push(newUser);
    existingUser = newUser;
    logger.info(
      `The Dude created anew user ${user.username} and added "${title}" to wishlist.`,
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
    throw new Error("Dude! User or wishlist not found");
  }

  const index = user.wishlist.indexOf(title);
  if (index === -1) {
    throw new Error("Dude! Title not found in wishlist");
  }

  user.wishlist.splice(index, 1);
  await db.write();

  logger.info(`The Dude removed "${title}" from ${user.username}'s wishlist.`);

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

// ============================================================================
// USER ACCOUNT - Library Card Linking
// ============================================================================

export async function linkLibraryCard(userId, username, cardNumber, pin) {
  const db = await initDB();

  let existingUser = db.data.users.find((u) => u.id === userId);

  if (existingUser) {
    existingUser.libraryCard = {
      cardNumber: cardNumber,
      pin: pin,
      linkedDate: Math.floor(Date.now() / 1000),
    };
    logger.info(`The Dude updated library card for ${username}`);
  } else {
    const newUser = {
      id: userId,
      username: username,
      wishlist: [],
      libraryCard: {
        cardNumber: cardNumber,
        pin: pin,
        linkedDate: Math.floor(Date.now() / 1000),
      },
    };
    db.data.users.push(newUser);
    existingUser = newUser;
    logger.info(`The Dude created new user ${username} with library card`);
  }

  await db.write();

  return existingUser;
}

export async function unlinkLibraryCard(userId) {
  const db = await initDB();

  const user = db.data.users.find((u) => u.id === userId);

  if (!user) {
    throw new Error("Dude! User not found");
  }

  if (!user.libraryCard) {
    throw new Error("Dude! No library card linked to this account");
  }

  delete user.libraryCard;
  await db.write();

  logger.info(`The Dude unlinked library card for ${user.username}`);

  return user;
}

export async function getLibraryCard(userId) {
  const db = await initDB();
  const user = db.data.users.find((u) => u.id === userId);

  if (!user || !user.libraryCard) {
    return null;
  }

  return user.libraryCard;
}

export async function getUsersWithLinkedCards() {
  const db = await initDB();
  return db.data.users
    .filter((u) => u.libraryCard)
    .map((u) => ({
      id: u.id,
      username: u.username,
      cardNumber: u.libraryCard.cardNumber,
      pin: u.libraryCard.pin,
    }));
}
