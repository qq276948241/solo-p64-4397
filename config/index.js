module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'pet-grooming-secret-key-2024',
  jwtExpiresIn: '7d',
  dbPath: './data/pet-grooming.db',
  memberLevels: {
    NORMAL: { name: '普通会员', discount: 1, minSpend: 0 },
    SILVER: { name: '银卡会员', discount: 0.9, minSpend: 200 },
    GOLD: { name: '金卡会员', discount: 0.85, minSpend: 500 }
  },
  serviceTypes: ['洗澡', '剪毛', 'SPA'],
  appointmentStatus: ['待服务', '已取消', '服务中', '已完成'],
  maxPhotos: 3
};
