ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_thread_id_fkey;
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_user_id_fkey;
ALTER TABLE public.chat_threads DROP CONSTRAINT IF EXISTS chat_threads_user_id_fkey;

DROP POLICY IF EXISTS messages_delete_own ON public.chat_messages;
DROP POLICY IF EXISTS messages_insert_own ON public.chat_messages;
DROP POLICY IF EXISTS messages_select_own ON public.chat_messages;
DROP POLICY IF EXISTS messages_update_own ON public.chat_messages;
DROP POLICY IF EXISTS threads_delete_own ON public.chat_threads;
DROP POLICY IF EXISTS threads_insert_own ON public.chat_threads;
DROP POLICY IF EXISTS threads_select_own ON public.chat_threads;
DROP POLICY IF EXISTS threads_update_own ON public.chat_threads;

ALTER TABLE public.chat_threads ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.chat_messages ALTER COLUMN user_id TYPE text USING user_id::text;

-- TEST MODE: open RLS. MUST tighten before production.
CREATE POLICY "test_mode_threads_all" ON public.chat_threads
  FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "test_mode_messages_all" ON public.chat_messages
  FOR ALL TO public USING (true) WITH CHECK (true);