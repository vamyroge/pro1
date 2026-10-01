#!/usr/bin/env node
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase');

const CATEGORIES = ['Novel', 'Science', 'Technology', 'History', 'Biography', 'Children', 'Reference', 'Other'];

const books = [
  { title: 'Clean Code', isbn: '9780132350884', author: 'Robert C. Martin', category: 'Technology', publisher: 'Prentice Hall', publish_year: 2008, quantity: 5, shelf: 'A1' },
  { title: 'The Pragmatic Programmer', isbn: '9780201616224', author: 'Andrew Hunt', category: 'Technology', publisher: 'Addison-Wesley', publish_year: 1999, quantity: 3, shelf: 'A1' },
  { title: 'Design Patterns', isbn: '9780201633610', author: 'Erich Gamma', category: 'Technology', publisher: 'Addison-Wesley', publish_year: 1994, quantity: 4, shelf: 'A2' },
  { title: 'Atomic Habits', isbn: '9780735211292', author: 'James Clear', category: 'Biography', publisher: 'Avery', publish_year: 2018, quantity: 6, shelf: 'B1' },
  { title: 'Sapiens', isbn: '9780062316097', author: 'Yuval Noah Harari', category: 'History', publisher: 'Harper', publish_year: 2011, quantity: 4, shelf: 'C1' },
  { title: 'A Brief History of Time', isbn: '9780553380163', author: 'Stephen Hawking', category: 'Science', publisher: 'Bantam', publish_year: 1988, quantity: 3, shelf: 'C2' },
  { title: 'The Selfish Gene', isbn: '9780198788607', author: 'Richard Dawkins', category: 'Science', publisher: 'Oxford', publish_year: 1976, quantity: 2, shelf: 'C2' },
  { title: 'Harry Potter and the Sorcerer\'s Stone', isbn: '9780590353427', author: 'J.K. Rowling', category: 'Children', publisher: 'Scholastic', publish_year: 1997, quantity: 7, shelf: 'D1' },
  { title: 'The Alchemist', isbn: '9780062315007', author: 'Paulo Coelho', category: 'Novel', publisher: 'HarperOne', publish_year: 1988, quantity: 5, shelf: 'D2' },
  { title: 'Dune', isbn: '9780441172719', author: 'Frank Herbert', category: 'Novel', publisher: 'Ace', publish_year: 1965, quantity: 4, shelf: 'D3' }
].map((b) => ({ ...b, available_quantity: b.quantity, description: b.title, cover_url: null }));

const readers = [
  { reader_code: 'R0001', full_name: 'Nguyen Van A', email: 'nguyenvana@example.com', phone: '0901000001', class_name: 'CS-K21', address: 'Hanoi' },
  { reader_code: 'R0002', full_name: 'Tran Thi B', email: 'tranthib@example.com', phone: '0901000002', class_name: 'CS-K21', address: 'HCMC' },
  { reader_code: 'R0003', full_name: 'Le Van C', email: 'levanc@example.com', phone: '0901000003', class_name: 'EE-K22', address: 'Danang' },
  { reader_code: 'R0004', full_name: 'Pham Thi D', email: 'phamthid@example.com', phone: '0901000004', class_name: 'ME-K22', address: 'Hue' },
  { reader_code: 'R0005', full_name: 'Hoang Van E', email: 'hoangvane@example.com', phone: '0901000005', class_name: 'SE-K23', address: 'Can Tho' }
].map((r) => ({ ...r, status: 'ACTIVE' }));

async function ensureAdmin() {
  const username = 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  const { data: existing } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
  if (existing) {
    console.log('admin user already exists');
    return;
  }
  const password_hash = await bcrypt.hash(password, 10);
  const { error } = await supabase.from('users').insert([{ username, password_hash, full_name: 'System Admin', role: 'ADMIN' }]);
  if (error) {
    console.error('Failed to create admin user:', error.message);
  } else {
    console.log(`Created default admin: ${username} / ${password}`);
  }
}

async function clearTable(name) {
  const { error } = await supabase.from(name).delete().neq('id', 0);
  if (error) console.warn(`Could not clear ${name}:`, error.message);
}

async function main() {
  console.log('Seeding database...');

  // Clear (safe because of FK constraints — borrowings first)
  await clearTable('activity_logs');
  await clearTable('borrowings');
  await clearTable('readers');
  await clearTable('books');

  const { data: booksInserted, error: booksErr } = await supabase.from('books').insert(books).select();
  if (booksErr) throw booksErr;
  console.log(`Inserted ${booksInserted.length} books`);

  const { data: readersInserted, error: readersErr } = await supabase.from('readers').insert(readers).select();
  if (readersErr) throw readersErr;
  console.log(`Inserted ${readersInserted.length} readers`);

  // Create some borrowings
  const today = new Date();
  const dueIn = (days) => {
    const d = new Date(today); d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const borrowPlans = [
    { idx: 0, days: 7 },
    { idx: 1, days: -3 }, // overdue
    { idx: 2, days: 14 }
  ];
  for (const plan of borrowPlans) {
    const reader = readersInserted[plan.idx % readersInserted.length];
    const book = booksInserted[plan.idx % booksInserted.length];
    const { error } = await supabase.rpc('borrow_book', {
      p_reader_id: reader.id, p_book_id: book.id, p_due_date: dueIn(plan.days), p_user_id: null
    });
    if (error) console.warn('Borrow seed failed:', error.message);
  }
  console.log('Seeded borrowings');

  await ensureAdmin();
  console.log('Seed complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
