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
  addSpendAndUpgrade,
  getMemberInfo
};
