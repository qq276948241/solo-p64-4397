const express = require('express');
const { query, queryOne, execute, db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { validatePhotos } = require('../middleware/validate');
const { getError } = require('../utils/errorCodes');
const { success, fail } = require('../utils/response');
const { addSpendAndUpgrade, calcDiscountedPrice } = require('../services/memberService');

const router = express.Router();

router.post('/', authMiddleware(['admin', 'staff']), validatePhotos, async (req, res) => {
  const { appointment_id, pet_behavior, supplies_used, final_amount, staff_notes, photo_urls } = req.body;

  if (!appointment_id) {
    return fail(res, getError('PARAM_ERROR', '预约ID不能为空'));
  }
  if (final_amount === undefined || final_amount === null) {
    return fail(res, getError('PARAM_ERROR', '实收金额不能为空'));
  }

  const appointment = await queryOne('SELECT * FROM appointments WHERE id = ?', [appointment_id]);
  if (!appointment) {
    return fail(res, getError('APPOINTMENT_NOT_FOUND'), 404);
  }

  const existingRecord = await queryOne('SELECT id FROM service_records WHERE appointment_id = ?', [appointment_id]);
  if (existingRecord) {
    return fail(res, getError('RECORD_EXISTS'));
  }

  const service = await queryOne('SELECT price FROM services WHERE id = ?', [appointment.service_id]);
  const originalAmount = service ? service.price : 0;
  const discountInfo = calcDiscountedPrice(originalAmount, (await queryOne('SELECT level FROM members WHERE user_id = ?', [appointment.customer_id])).level);
  const discountAmount = Number((originalAmount - Number(final_amount)).toFixed(2));

  try {
    const result = await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION', async (err) => {
          if (err) { reject(err); return; }

          try {
            const recordResult = await execute(
              `INSERT INTO service_records 
               (appointment_id, pet_behavior, supplies_used, original_amount, discount_amount, final_amount, staff_notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [appointment_id, pet_behavior || null, supplies_used || null,
                originalAmount, discountAmount, Number(final_amount), staff_notes || null]
            );

            if (photo_urls && photo_urls.length > 0) {
              const photoStmt = db.prepare('INSERT INTO service_photos (record_id, photo_url) VALUES (?, ?)');
              for (const url of photo_urls) {
                photoStmt.run(recordResult.lastID, url);
              }
              photoStmt.finalize();
            }

            await execute("UPDATE appointments SET status = '已完成' WHERE id = ?", [appointment_id]);

            await addSpendAndUpgrade(appointment.customer_id, Number(final_amount));

            db.run('COMMIT', (e) => {
              if (e) { reject(e); } else { resolve(recordResult); }
            });
          } catch (e) {
            db.run('ROLLBACK', () => reject(e));
          }
        });
      });
    });

    const record = await getRecordDetail(result.lastID);
    return success(res, record, '服务记录创建成功');
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.get('/', authMiddleware(), async (req, res) => {
  try {
    const { customer_id, pet_id, groomer_id, start_date, end_date } = req.query;
    let sql = `SELECT sr.*,
      a.appointment_date, a.appointment_time, a.status as appointment_status,
      p.name as pet_name, p.breed as pet_breed,
      g.name as groomer_name,
      s.name as service_name,
      cu.name as customer_name, cu.phone as customer_phone
      FROM service_records sr
      JOIN appointments a ON sr.appointment_id = a.id
      JOIN pets p ON a.pet_id = p.id
      JOIN groomers g ON a.groomer_id = g.id
      JOIN services s ON a.service_id = s.id
      JOIN users cu ON a.customer_id = cu.id WHERE 1=1`;
    const params = [];

    if (req.user.role === 'customer') {
      sql += ' AND a.customer_id = ?';
      params.push(req.user.id);
    }
    if (customer_id) {
      sql += ' AND a.customer_id = ?';
      params.push(customer_id);
    }
    if (pet_id) {
      sql += ' AND a.pet_id = ?';
      params.push(pet_id);
    }
    if (groomer_id) {
      sql += ' AND a.groomer_id = ?';
      params.push(groomer_id);
    }
    if (start_date) {
      sql += ' AND a.appointment_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND a.appointment_date <= ?';
      params.push(end_date);
    }

    sql += ' ORDER BY sr.created_at DESC';
    let records = await query(sql, params);

    const recordIds = records.map(r => r.id);
    if (recordIds.length > 0) {
      const placeholders = recordIds.map(() => '?').join(',');
      const photos = await query(
        `SELECT * FROM service_photos WHERE record_id IN (${placeholders}) ORDER BY id`,
        recordIds
      );
      const photoMap = {};
      photos.forEach(p => {
        if (!photoMap[p.record_id]) photoMap[p.record_id] = [];
        photoMap[p.record_id].push(p.photo_url);
      });
      records = records.map(r => ({ ...r, photos: photoMap[r.id] || [] }));
    }

    return success(res, records);
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.get('/:id', authMiddleware(), async (req, res) => {
  try {
    const record = await getRecordDetail(req.params.id);
    if (!record) {
      return fail(res, getError('RECORD_NOT_FOUND'), 404);
    }
    if (req.user.role === 'customer' && record.customer_id !== req.user.id) {
      return fail(res, getError('FORBIDDEN'), 403);
    }
    return success(res, record);
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.put('/:id/photos', authMiddleware(['admin', 'staff']), validatePhotos, async (req, res) => {
  try {
    const { photo_urls } = req.body;

    const record = await queryOne('SELECT id FROM service_records WHERE id = ?', [req.params.id]);
    if (!record) {
      return fail(res, getError('RECORD_NOT_FOUND'), 404);
    }

    await execute('DELETE FROM service_photos WHERE record_id = ?', [req.params.id]);
    for (const url of photo_urls) {
      await execute('INSERT INTO service_photos (record_id, photo_url) VALUES (?, ?)', [req.params.id, url]);
    }

    const updated = await getRecordDetail(req.params.id);
    return success(res, updated, '照片更新成功');
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

async function getRecordDetail(id) {
  const record = await queryOne(
    `SELECT sr.*,
      a.customer_id, a.appointment_date, a.appointment_time, a.status as appointment_status,
      p.name as pet_name, p.breed as pet_breed, p.weight as pet_weight,
      g.name as groomer_name,
      s.name as service_name, s.price as service_price,
      cu.name as customer_name, cu.phone as customer_phone
      FROM service_records sr
      JOIN appointments a ON sr.appointment_id = a.id
      JOIN pets p ON a.pet_id = p.id
      JOIN groomers g ON a.groomer_id = g.id
      JOIN services s ON a.service_id = s.id
      JOIN users cu ON a.customer_id = cu.id
      WHERE sr.id = ?`,
    [id]
  );
  if (!record) return null;

  const photos = await query('SELECT photo_url FROM service_photos WHERE record_id = ? ORDER BY id', [id]);
  record.photos = photos.map(p => p.photo_url);
  return record;
}

module.exports = router;
