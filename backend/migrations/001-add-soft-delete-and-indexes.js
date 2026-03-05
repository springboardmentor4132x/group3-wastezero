/**
 * Migration: Add soft-delete flag and indexes for Milestone 2
 *
 * What it does:
 * 1. Adds isDeleted = false to all existing Opportunity documents that lack the field
 * 2. Creates indexes on Opportunity and Application collections
 *
 * Usage:
 *   node migrations/001-add-soft-delete-and-indexes.js
 *
 * Rollback:
 *   node migrations/001-add-soft-delete-and-indexes.js --rollback
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const dns = require('dns');

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const isRollback = process.argv.includes('--rollback');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // ── 1. Ensure Opportunity collection exists and add isDeleted default ──
    const oppCollection = db.collection('opportunities');
    const result = await oppCollection.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } }
    );
    console.log(`Updated ${result.modifiedCount} opportunity documents with isDeleted=false`);

    // ── 2. Create indexes on Opportunities (skip if already exists) ──
    console.log('Creating Opportunity indexes...');
    const oppIndexes = [
      [{ status: 1, isDeleted: 1, createdAt: -1 }, { name: 'opp_status_deleted_created', background: true }],
      [{ ngo_id: 1, isDeleted: 1, createdAt: -1 }, { name: 'opp_ngo_deleted_created', background: true }],
      [{ location: 1 }, { name: 'opp_location', background: true }],
      [{ requiredSkills: 1 }, { name: 'opp_skills', background: true }],
      [{ status: 1, isDeleted: 1, location: 1 }, { name: 'opp_status_deleted_location', background: true }],
    ];
    for (const [keys, opts] of oppIndexes) {
      try { await oppCollection.createIndex(keys, opts); }
      catch (e) { if (e.code !== 85 && e.code !== 86) throw e; console.log(`  ⚠ Index ${opts.name} already exists, skipping`); }
    }
    console.log('Opportunity indexes done');

    // ── 3. Create indexes on Applications (skip if already exists) ──
    const appCollection = db.collection('applications');
    console.log('Creating Application indexes...');
    const appIndexes = [
      [{ opportunity_id: 1, volunteer_id: 1 }, { name: 'app_opp_vol_unique', unique: true, background: true }],
      [{ opportunity_id: 1, status: 1 }, { name: 'app_opp_status', background: true }],
      [{ volunteer_id: 1, createdAt: -1 }, { name: 'app_vol_created', background: true }],
      [{ status: 1 }, { name: 'app_status', background: true }],
    ];
    for (const [keys, opts] of appIndexes) {
      try { await appCollection.createIndex(keys, opts); }
      catch (e) { if (e.code !== 85 && e.code !== 86) throw e; console.log(`  ⚠ Index ${opts.name} already exists, skipping`); }
    }
    console.log('Application indexes done');

    console.log('\n✅ Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

async function rollback() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // Drop custom indexes
    const oppCollection = db.collection('opportunities');
    const appCollection = db.collection('applications');

    const oppIndexNames = [
      'opp_status_deleted_created',
      'opp_ngo_deleted_created',
      'opp_location',
      'opp_skills',
      'opp_status_deleted_location',
    ];
    for (const name of oppIndexNames) {
      try {
        await oppCollection.dropIndex(name);
        console.log(`Dropped index: ${name}`);
      } catch (e) {
        console.log(`Index ${name} not found, skipping`);
      }
    }

    const appIndexNames = [
      'app_opp_vol_unique',
      'app_opp_status',
      'app_vol_created',
      'app_status',
    ];
    for (const name of appIndexNames) {
      try {
        await appCollection.dropIndex(name);
        console.log(`Dropped index: ${name}`);
      } catch (e) {
        console.log(`Index ${name} not found, skipping`);
      }
    }

    // Remove isDeleted field from opportunities
    const result = await oppCollection.updateMany(
      {},
      { $unset: { isDeleted: '' } }
    );
    console.log(`Removed isDeleted from ${result.modifiedCount} documents`);

    console.log('\n✅ Rollback completed successfully');
  } catch (error) {
    console.error('Rollback failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

if (isRollback) {
  rollback();
} else {
  migrate();
}
