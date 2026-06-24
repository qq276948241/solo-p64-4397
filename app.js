const express = require('express');
const cors = require('cors');
const config = require('./config');
const initDatabase = require('./scripts/init-db');
const { getError } = require('./utils/errorCodes');
const { fail } = require('./utils/response');

const authRoutes = require('./routes/auth');
const petRoutes = require('./routes/pets');
const appointmentRoutes = require('./routes/appointments');
const serviceRecordRoutes = require('./routes/serviceRecords');
const memberRoutes = require('./routes/members');
const baseRoutes = require('./routes/base');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    code: 0,
    message: '宠物美容店预约管理系统 API',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        profile: 'GET /api/auth/profile'
      },
      pets: {
        create: 'POST /api/pets',
        list: 'GET /api/pets',
        detail: 'GET /api/pets/:id',
        update: 'PUT /api/pets/:id',
        delete: 'DELETE /api/pets/:id'
      },
      appointments: {
        create: 'POST /api/appointments',
        list: 'GET /api/appointments',
        detail: 'GET /api/appointments/:id',
        cancel: 'PUT /api/appointments/:id/cancel',
        updateStatus: 'PUT /api/appointments/:id/status'
      },
      serviceRecords: {
        create: 'POST /api/service-records',
        list: 'GET /api/service-records',
        detail: 'GET /api/service-records/:id',
        updatePhotos: 'PUT /api/service-records/:id/photos'
      },
      members: {
        me: 'GET /api/members/me',
        list: 'GET /api/members',
        levels: 'GET /api/members/levels',
        detail: 'GET /api/members/:userId'
      },
      base: {
        groomers: 'GET /api/base/groomers',
        groomerSchedule: 'GET /api/base/groomers/:id/schedule',
        services: 'GET /api/base/services'
      }
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/service-records', serviceRecordRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/base', baseRoutes);

app.use((req, res) => {
  return fail(res, getError('NOT_FOUND', '接口不存在'), 404);
});

app.use((err, req, res, next) => {
  console.error('未捕获的错误:', err);
  if (err.type === 'entity.parse.failed') {
    return fail(res, getError('PARAM_ERROR', 'JSON格式错误'));
  }
  return fail(res, getError('UNKNOWN_ERROR', err.message), 500);
});

async function start() {
  try {
    await initDatabase();

    app.listen(config.port, () => {
      console.log(`服务器运行在 http://localhost:${config.port}`);
      console.log('默认账号:');
      console.log('  管理员: admin / admin123');
      console.log('  店员:   staff / staff123');
      console.log('  顾客:   customer / customer123');
    });
  } catch (err) {
    console.error('启动失败:', err);
    process.exit(1);
  }
}

start();

module.exports = app;
