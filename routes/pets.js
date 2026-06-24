const express = require('express');
const { query, queryOne, execute } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { getError } = require('../utils/errorCodes');
const { success, fail } = require('../utils/response');

const router = express.Router();

router.post('/', authMiddleware(), async (req, res) => {
  try {
    const { name, breed, weight, vaccine_status, notes } = req.body;
    if (!name) {
      return fail(res, getError('PARAM_ERROR', '宠物名字不能为空'));
    }

    const result = await execute(
      `INSERT INTO pets (owner_id, name, breed, weight, vaccine_status, notes) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, breed || null, weight || null, vaccine_status || null, notes || null]
    );

    const pet = await queryOne('SELECT * FROM pets WHERE id = ?', [result.lastID]);
    return success(res, pet, '宠物档案创建成功');
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.get('/', authMiddleware(), async (req, res) => {
  try {
    let pets;
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      const { owner_id } = req.query;
      if (owner_id) {
        pets = await query(
          `SELECT p.*, u.name as owner_name, u.phone as owner_phone 
           FROM pets p JOIN users u ON p.owner_id = u.id WHERE p.owner_id = ? 
           ORDER BY p.created_at DESC`,
          [owner_id]
        );
      } else {
        pets = await query(
          `SELECT p.*, u.name as owner_name, u.phone as owner_phone 
           FROM pets p JOIN users u ON p.owner_id = u.id 
           ORDER BY p.created_at DESC`
        );
      }
    } else {
      pets = await query(
        'SELECT * FROM pets WHERE owner_id = ? ORDER BY created_at DESC',
        [req.user.id]
      );
    }
    return success(res, pets);
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.get('/:id', authMiddleware(), async (req, res) => {
  try {
    const pet = await queryOne(
      `SELECT p.*, u.name as owner_name, u.phone as owner_phone 
       FROM pets p JOIN users u ON p.owner_id = u.id WHERE p.id = ?`,
      [req.params.id]
    );
    if (!pet) {
      return fail(res, getError('PET_NOT_FOUND'), 404);
    }
    if (req.user.role === 'customer' && pet.owner_id !== req.user.id) {
      return fail(res, getError('PET_NOT_OWNER'), 403);
    }
    return success(res, pet);
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.put('/:id', authMiddleware(), async (req, res) => {
  try {
    const pet = await queryOne('SELECT * FROM pets WHERE id = ?', [req.params.id]);
    if (!pet) {
      return fail(res, getError('PET_NOT_FOUND'), 404);
    }
    if (req.user.role === 'customer' && pet.owner_id !== req.user.id) {
      return fail(res, getError('PET_NOT_OWNER'), 403);
    }

    const { name, breed, weight, vaccine_status, notes } = req.body;
    await execute(
      `UPDATE pets SET name = ?, breed = ?, weight = ?, vaccine_status = ?, notes = ? 
       WHERE id = ?`,
      [
        name || pet.name,
        breed !== undefined ? breed : pet.breed,
        weight !== undefined ? weight : pet.weight,
        vaccine_status !== undefined ? vaccine_status : pet.vaccine_status,
        notes !== undefined ? notes : pet.notes,
        req.params.id
      ]
    );

    const updated = await queryOne('SELECT * FROM pets WHERE id = ?', [req.params.id]);
    return success(res, updated, '宠物档案更新成功');
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.delete('/:id', authMiddleware(), async (req, res) => {
  try {
    const pet = await queryOne('SELECT * FROM pets WHERE id = ?', [req.params.id]);
    if (!pet) {
      return fail(res, getError('PET_NOT_FOUND'), 404);
    }
    if (req.user.role === 'customer' && pet.owner_id !== req.user.id) {
      return fail(res, getError('PET_NOT_OWNER'), 403);
    }

    await execute('DELETE FROM pets WHERE id = ?', [req.params.id]);
    return success(res, null, '宠物档案删除成功');
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

module.exports = router;
