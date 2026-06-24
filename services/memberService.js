const config = require('../config');
const { queryOne, execute } = require('../db');
const { getError } = require('../utils/errorCodes');

function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

function getLevelBySpend(totalSpent) {
  const totalCents = toCents(totalSpent);
  const levels = Object.entries(config.memberLevels)
    .filter(([_, v]) => totalCents >= toCents(v.minSpend))
    .sort((a, b) => toCents(b[1].minSpend) - toCents(a[1].minSpend));
  return levels.length > 0 ? levels[0][0] : 'NORMAL';
}

function getDiscount(level) {
  const levelConfig = config.memberLevels[level];
  return levelConfig ? levelConfig.discount : 1;
}

function getNextLevel(totalSpent) {
  const totalCents = toCents(totalSpent);
  const levels = Object.entries(config.memberLevels)
    .sort((a, b) => toCents(b[1].minSpend) - toCents(a[1].minSpend));

  let nextLevel = null;
  for (let i = levels.length - 1; i >= 0; i--) {
    const minSpendCents = toCents(levels[i][1].minSpend);
    if (totalCents < minSpendCents) {
      nextLevel = {
        key: levels[i][0],
        name: levels[i][1].name,
        minSpend: levels[i][1].minSpend,
        discount: levels[i][1].discount,
        amountToReach: fromCents(minSpendCents - totalCents)
      };
      break;
    }
  }
  return nextLevel;
}

function calcDiscountedPrice(originalPrice, level) {
  const originalCents = toCents(originalPrice);
  const discount = getDiscount(level);
  const finalCents = Math.round(originalCents * discount);
  const finalPrice = fromCents(finalCents);
  const discountAmount = fromCents(originalCents - finalCents);
  return { originalPrice: Number(originalPrice), finalPrice, discountAmount, discount, level };
}

async function addSpendAndUpgrade(userId, amount) {
  const member = await queryOne('SELECT * FROM members WHERE user_id = ?', [userId]);
  if (!member) {
    throw getError('MEMBER_NOT_FOUND');
  }

  const newTotalCents = toCents(member.total_spent) + toCents(amount);
  const newTotal = fromCents(newTotalCents);
  const newLevel = getLevelBySpend(newTotal);

  await execute(
    'UPDATE members SET total_spent = ?, level = ? WHERE user_id = ?',
    [newTotal, newLevel, userId]
  );

  return {
    total_spent: newTotal,
    level: newLevel,
    level_info: config.memberLevels[newLevel]
  };
}

async function getMemberInfo(userId) {
  const member = await queryOne(
    `SELECT m.*, u.name, u.phone, u.username 
     FROM members m 
     JOIN users u ON m.user_id = u.id 
     WHERE m.user_id = ?`,
    [userId]
  );
  if (!member) {
    throw getError('MEMBER_NOT_FOUND');
  }
  member.level_info = config.memberLevels[member.level];
  member.discount = getDiscount(member.level);
  return member;
}

module.exports = {
  toCents,
  fromCents,
  getLevelBySpend,
  getDiscount,
  getNextLevel,
  calcDiscountedPrice,
  addSpendAndUpgrade,
  getMemberInfo
};
