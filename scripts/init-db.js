const { db } = require('../db');
const bcrypt = require('bcryptjs');
const config = require('../config');

const initSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  name TEXT NOT NULL,
  phone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  level TEXT NOT NULL DEFAULT 'NORMAL',
  total_spent REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS groomers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  price REAL NOT NULL,
  duration INTEGER NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS pets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  breed TEXT,
  weight REAL,
  vaccine_status TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  pet_id INTEGER NOT NULL,
  groomer_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '待服务',
  cancel_reason TEXT,
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  FOREIGN KEY (groomer_id) REFERENCES groomers(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER UNIQUE NOT NULL,
  pet_behavior TEXT,
  supplies_used TEXT,
  original_amount REAL NOT NULL,
  discount_amount REAL NOT NULL DEFAULT 0,
  final_amount REAL NOT NULL,
  staff_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER NOT NULL,
  photo_url TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (record_id) REFERENCES service_records(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_appointments_groomer_time ON appointments(groomer_id, appointment_date, appointment_time, status);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(owner_id);
CREATE INDEX IF NOT EXISTS idx_service_photos_record ON service_photos(record_id);
`;

function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.exec(initSql, async (err) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const adminExists = await new Promise((res) => {
            db.get('SELECT id FROM users WHERE username = ?', ['admin'], (e, row) => res(row));
          });

          if (!adminExists) {
            const hashedPwd = bcrypt.hashSync('admin123', 10);
            db.run(
              'INSERT INTO users (username, password, role, name, phone) VALUES (?, ?, ?, ?, ?)',
              ['admin', hashedPwd, 'admin', '系统管理员', '13800000000']
            );
            db.run('INSERT INTO members (user_id, level, total_spent) VALUES (?, ?, ?)', [1, 'NORMAL', 0]);
          }

          const staffExists = await new Promise((res) => {
            db.get('SELECT id FROM users WHERE username = ?', ['staff'], (e, row) => res(row));
          });

          if (!staffExists) {
            const hashedPwd = bcrypt.hashSync('staff123', 10);
            db.run(
              'INSERT INTO users (username, password, role, name, phone) VALUES (?, ?, ?, ?, ?)',
              ['staff', hashedPwd, 'staff', '店员小张', '13800000001']
            );
            db.run('INSERT INTO members (user_id, level, total_spent) VALUES (?, ?, ?)', [2, 'NORMAL', 0]);
          }

          const customerExists = await new Promise((res) => {
            db.get('SELECT id FROM users WHERE username = ?', ['customer'], (e, row) => res(row));
          });

          if (!customerExists) {
            const hashedPwd = bcrypt.hashSync('customer123', 10);
            db.run(
              'INSERT INTO users (username, password, role, name, phone) VALUES (?, ?, ?, ?, ?)',
              ['customer', hashedPwd, 'customer', '顾客小李', '13800000002']
            );
            db.run('INSERT INTO members (user_id, level, total_spent) VALUES (?, ?, ?)', [3, 'NORMAL', 0]);
          }

          const groomerCount = await new Promise((res) => {
            db.get('SELECT COUNT(*) as cnt FROM groomers', (e, row) => res(row.cnt));
          });

          if (groomerCount === 0) {
            const groomers = [
              { name: '美容师小王', phone: '13900000001', description: '擅长造型剪毛，5年经验' },
              { name: '美容师小刘', phone: '13900000002', description: 'SPA专家，细致耐心' }
            ];
            const stmt = db.prepare('INSERT INTO groomers (name, phone, description) VALUES (?, ?, ?)');
            groomers.forEach(g => stmt.run(g.name, g.phone, g.description));
            stmt.finalize();
          }

          const serviceCount = await new Promise((res) => {
            db.get('SELECT COUNT(*) as cnt FROM services', (e, row) => res(row.cnt));
          });

          if (serviceCount === 0) {
            const services = [
              { name: '洗澡', price: 80, duration: 60, description: '基础清洁护理' },
              { name: '剪毛', price: 180, duration: 120, description: '造型修剪' },
              { name: 'SPA', price: 280, duration: 90, description: '深度护理放松' }
            ];
            const stmt = db.prepare('INSERT INTO services (name, price, duration, description) VALUES (?, ?, ?, ?)');
            services.forEach(s => stmt.run(s.name, s.price, s.duration, s.description));
            stmt.finalize();
          }

          console.log('数据库初始化完成');
          console.log('默认账号: admin/admin123, staff/staff123, customer/customer123');
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });
}

if (require.main === module) {
  initDatabase()
    .then(() => {
      db.close();
      process.exit(0);
    })
    .catch(err => {
      console.error('初始化失败:', err);
      process.exit(1);
    });
}

module.exports = initDatabase;
