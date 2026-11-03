const express = require('express');
const supabaseAdmin = require('../config/supabase');

const router = express.Router();

router.get('/', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('categories')
    .select('id')
    .limit(1);

  if (error) {
    return res.status(500).json({
      status: 'error',
      api: 'running',
      database: 'unreachable',
      message: error.message,
    });
  }

  res.json({
    status: 'ok',
    api: 'running',
    database: 'connected',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
