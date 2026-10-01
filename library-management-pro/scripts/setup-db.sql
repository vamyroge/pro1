-- ==========================================================
-- Library Management Pro - Supabase PostgreSQL Schema
-- ==========================================================

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop in reverse order to avoid FK conflicts
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.borrowings CASCADE;
DROP TABLE IF EXISTS public.readers CASCADE;
DROP TABLE IF EXISTS public.books CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

DROP FUNCTION IF EXISTS public.borrow_book(CHAR, BIGINT, BIGINT, DATE);
DROP FUNCTION IF EXISTS public.return_book(BIGINT);

-- ==========================================================
-- USERS (admin/librarian)
-- ==========================================================
CREATE TABLE public.users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(120),
    role VARCHAR(20) NOT NULL DEFAULT 'LIBRARIAN'
        CHECK (role IN ('ADMIN', 'LIBRARIAN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON public.users(username);

-- ==========================================================
-- BOOKS
-- ==========================================================
CREATE TABLE public.books (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    isbn VARCHAR(32) UNIQUE,
    author TEXT,
    category VARCHAR(80),
    publisher TEXT,
    publish_year INT CHECK (publish_year IS NULL OR (publish_year BETWEEN 1000 AND 3000)),
    quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    available_quantity INT NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
    shelf VARCHAR(40),
    description TEXT,
    cover_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_available_le_quantity CHECK (available_quantity <= quantity)
);

CREATE INDEX idx_books_title ON public.books USING gin (to_tsvector('simple', coalesce(title,'')));
CREATE INDEX idx_books_isbn ON public.books(isbn);
CREATE INDEX idx_books_author ON public.books USING gin (to_tsvector('simple', coalesce(author,'')));
CREATE INDEX idx_books_category ON public.books(category);

-- ==========================================================
-- READERS
-- ==========================================================
CREATE TABLE public.readers (
    id BIGSERIAL PRIMARY KEY,
    reader_code VARCHAR(40) UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email VARCHAR(120),
    phone VARCHAR(30),
    class_name VARCHAR(60),
    address TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_email_format CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_readers_code ON public.readers(reader_code);
CREATE INDEX idx_readers_full_name ON public.readers USING gin (to_tsvector('simple', full_name));
CREATE INDEX idx_readers_email ON public.readers(email);

-- ==========================================================
-- BORROWINGS
-- ==========================================================
CREATE TABLE public.borrowings (
    id BIGSERIAL PRIMARY KEY,
    reader_id BIGINT NOT NULL REFERENCES public.readers(id) ON DELETE RESTRICT,
    book_id BIGINT NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
    borrow_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    return_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'BORROWING'
        CHECK (status IN ('BORROWING', 'RETURNED', 'OVERDUE')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_due_after_borrow CHECK (due_date >= borrow_date),
    CONSTRAINT chk_return_after_borrow CHECK (return_date IS NULL OR return_date >= borrow_date)
);

CREATE INDEX idx_borrowings_reader ON public.borrowings(reader_id);
CREATE INDEX idx_borrowings_book ON public.borrowings(book_id);
CREATE INDEX idx_borrowings_status ON public.borrowings(status);
CREATE INDEX idx_borrowings_due_date ON public.borrowings(due_date);

-- ==========================================================
-- ACTIVITY LOGS
-- ==========================================================
CREATE TABLE public.activity_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    action VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id BIGINT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- ==========================================================
-- updated_at triggers
-- ==========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_books_updated_at
    BEFORE UPDATE ON public.books
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_readers_updated_at
    BEFORE UPDATE ON public.readers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_borrowings_updated_at
    BEFORE UPDATE ON public.borrowings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================================
-- Atomic borrow transaction
-- ==========================================================
CREATE OR REPLACE FUNCTION public.borrow_book(
    p_reader_id BIGINT,
    p_book_id BIGINT,
    p_due_date DATE,
    p_user_id BIGINT DEFAULT NULL
)
RETURNS TABLE(borrowing_id BIGINT, new_available INT) AS $$
DECLARE
    v_reader_status VARCHAR(20);
    v_book_title TEXT;
    v_avail INT;
    v_qty INT;
    v_new_borrow_id BIGINT;
BEGIN
    -- Lock reader row
    SELECT status INTO v_reader_status FROM public.readers WHERE id = p_reader_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'READER_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF v_reader_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'READER_INACTIVE' USING ERRCODE = 'P0001';
    END IF;

    -- Lock book row
    SELECT title, available_quantity, quantity INTO v_book_title, v_avail, v_qty
        FROM public.books WHERE id = p_book_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BOOK_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF v_avail <= 0 THEN
        RAISE EXCEPTION 'NO_AVAILABLE_COPY' USING ERRCODE = 'P0001';
    END IF;

    -- Validate due date
    IF p_due_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'INVALID_DUE_DATE' USING ERRCODE = 'P0001';
    END IF;

    -- Create borrowing
    INSERT INTO public.borrowings (reader_id, book_id, borrow_date, due_date, status)
    VALUES (p_reader_id, p_book_id, CURRENT_DATE, p_due_date, 'BORROWING')
    RETURNING id INTO v_new_borrow_id;

    -- Decrement available quantity
    UPDATE public.books SET available_quantity = available_quantity - 1
    WHERE id = p_book_id
    RETURNING available_quantity INTO v_avail;

    -- Activity log
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, description)
    VALUES (p_user_id, 'BORROW', 'BORROWING', v_new_borrow_id,
            format('Reader #%s borrowed book "%s"', p_reader_id, v_book_title));

    RETURN QUERY SELECT v_new_borrow_id, v_avail;
END;
$$ LANGUAGE plpgsql;

-- ==========================================================
-- Atomic return transaction
-- ==========================================================
CREATE OR REPLACE FUNCTION public.return_book(
    p_borrowing_id BIGINT,
    p_user_id BIGINT DEFAULT NULL
)
RETURNS TABLE(borrowing_id BIGINT, new_available INT) AS $$
DECLARE
    v_status VARCHAR(20);
    v_book_id BIGINT;
    v_reader_id BIGINT;
    v_book_title TEXT;
    v_avail INT;
BEGIN
    SELECT status, book_id, reader_id INTO v_status, v_book_id, v_reader_id
        FROM public.borrowings WHERE id = p_borrowing_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BORROWING_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF v_status = 'RETURNED' THEN
        RAISE EXCEPTION 'ALREADY_RETURNED' USING ERRCODE = 'P0001';
    END IF;

    -- Lock book row
    SELECT title, available_quantity INTO v_book_title, v_avail
        FROM public.books WHERE id = v_book_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BOOK_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    -- Update borrowing
    UPDATE public.borrowings
        SET status = 'RETURNED',
            return_date = CURRENT_DATE
    WHERE id = p_borrowing_id;

    -- Increment available quantity
    UPDATE public.books SET available_quantity = available_quantity + 1
    WHERE id = v_book_id
    RETURNING available_quantity INTO v_avail;

    -- Activity log
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, description)
    VALUES (p_user_id, 'RETURN', 'BORROWING', p_borrowing_id,
            format('Reader #%s returned book "%s"', v_reader_id, v_book_title));

    RETURN QUERY SELECT p_borrowing_id, v_avail;
END;
$$ LANGUAGE plpgsql;

-- ==========================================================
-- OVERDUE view (computed on read)
-- ==========================================================
CREATE OR REPLACE VIEW public.v_borrowings_overdue AS
SELECT b.*
FROM public.borrowings b
WHERE b.status = 'BORROWING' AND b.due_date < CURRENT_DATE;
