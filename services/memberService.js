const config = require('../config');
const { queryOne, execute } = require('../db');
const { getError } = require('../utils/errorCodes');

function getLevelBySpend(totalSpent) {
  const levels = Object.entries(config.memberLevels)
    .filter(([_, v]) => totalSpent >= v.minSpend)
    .sort((a, b) => b[1].minSpend - a[1].minSpend);
  return levels.length > 0 ? levels[0][0] : 'NORMAL';
}

function getDiscount(level) {
  const levelConfig = config.memberLevels[level];
  return levelConfig ? levelConfig.discount : 1;
}

function getNextLevel(totalSpent) {
  const levels = Object.entries(config.memberLevels)
    .sort((a, b) => b[1].minSpend - a[1].minSpend);

  let nextLevel = null;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (totalSpent < levels[i][1].minSpend) {
      nextLevel = {
        key: levels[i][0],
        name: levels[i][1].name,
        minSpend: levels[i][1].minSpend,
        discount: levels[i][1].discount,
        amountToReach: Number((levels[i][1].minSpend - totalSpent).toFixed(2))
      };
      break;
    }
  }
  return nextLevel;
}

function calcDiscountedPrice(originalPrice, level) {
  const discount = getDiscount(level);
  const finalPrice = Number((originalPrice * discount).toFixed(2));
  const discountAmount = Number((originalPrice - finalPrice).toFixed(2));
  return { originalPrice, finalPrice, discountAmount, discount, level };
}

async function addSpendAndUpgrade(userId, amount) {
  const member = await queryOne('SELECT * FROM members WHERE user_id = ?', [userId]);
  if (!member) {
    throw getError('MEMBER_NOT_FOUND');
  }

  const newTotal = Number((member.total_spent + amount).toFixed(2));
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
  getLevelBySpend,
  getDiscount,
  getNextLevel,
  calcDiscountedPrice,
  addSpendAndUpgrade,
  getMemberInfo
};
