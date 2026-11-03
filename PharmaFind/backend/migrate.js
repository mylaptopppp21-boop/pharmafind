
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const supabase = require('./config/supabase');

async function migrate() {
  try {
    const file = path.join(__dirname, 'data', 'db.json');
    const db = JSON.parse(fs.readFileSync(file, 'utf8'));

    // 1. Migrate users
    const users = db.users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      password_hash: u.passwordHash,
      created_at: u.createdAt
    }));

    if (users.length) {
      const { error } = await supabase
        .from('app_users').upsert(users, { onConflict: 'id' });
      if (error) throw error;
    }

    // 2. Migrate pharmacies
    const pharmacies = db.pharmacies.map(p => ({
      id: p.id,
      name: p.name,
      owner_id: p.ownerId,
      address: p.address,
      city: p.city || '',
      phone: p.phone || '',
      description: p.description || '',
      verified: p.verified || false
    }));

    if (pharmacies.length) {
      const { error } = await supabase
        .from('pharmacies').upsert(pharmacies, { onConflict: 'id' });
      if (error) throw error;
    }

    // 3. Migrate inventory
    const inventory = db.inventory.map(i => ({
      id: i.id,
      pharmacy_id: i.pharmacyId,
      name: i.name,
      generic_name: i.genericName,
      category: i.category,
      form: i.form,
      price: i.price,
      brand: i.brand,
      prescription: i.prescription,
      stock: i.stock,
      description: i.description
    }));

    if (inventory.length) {
      const { error } = await supabase
        .from('inventory').upsert(inventory, { onConflict: 'id' });
      if (error) throw error;
    }

    console.log('Migration successful!');
    console.log('Users:', users.length);
    console.log('Pharmacies:', pharmacies.length);
    console.log('Inventory:', inventory.length);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  }
}

migrate();
