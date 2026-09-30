import { createClient } from "@supabase/supabase-js";

// The connection to vervetDB's Supabase project. These two values are
// public by design (they're sent to every visitor's browser); what people
// can actually do is controlled by the database's access rules
// (see supabase/schema.sql). Never put the secret / service_role key here.
const SUPABASE_URL = "https://demlwtsrnlkiskcntbcc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6Ts_XZUKA56m-izWdKPI_Q_dnvWnNC3";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
