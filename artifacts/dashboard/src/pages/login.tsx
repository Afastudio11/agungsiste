import { useState, FormEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

function MsIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={`material-symbols-outlined select-none leading-none ${className ?? ""}`}
      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
    >
      {name}
    </span>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login gagal. Periksa username dan password.");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
  };

  return (
    <div className="min-h-screen flex items-center justify-center overflow-hidden relative" style={{ background: "#f0f4ff" }}>

      {/* ── Abstract blobs ───────────────────────────────────── */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: "-15%",
          left: "-10%",
          width: 560,
          height: 560,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,84,202,0.14) 0%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          bottom: "-10%",
          right: "-8%",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,61,212,0.10) 0%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          top: "40%",
          right: "15%",
          width: 220,
          height: 220,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,105,71,0.06) 0%, transparent 70%)",
        }}
      />

      {/* ── Main card ────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-[460px] px-5 py-10">
        <div
          style={{
            background: "rgba(255,255,255,0.50)",
            backdropFilter: "blur(40px)",
            WebkitBackdropFilter: "blur(40px)",
            border: "1px solid rgba(255,255,255,0.55)",
            boxShadow: "0 4px 24px -1px rgba(0,0,0,0.04), 0 40px 80px -20px rgba(0,84,202,0.10)",
            borderRadius: "2rem",
          }}
          className="p-8 md:p-10"
        >

          {/* ── Form ─────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Username */}
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-[10px] font-bold tracking-[0.12em] text-slate-500 ml-1"
              >
                Username
              </label>
              <div className="relative group">
                <MsIcon
                  name="person"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] transition-colors group-focus-within:text-blue-600"
                />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan username"
                  required
                  autoFocus
                  className="w-full py-3.5 pl-11 pr-5 text-[13px] text-slate-800 placeholder:text-slate-400 transition-all focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.55)",
                    border: "1px solid rgba(255,255,255,0.70)",
                    borderRadius: 9999,
                    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.04)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.95)";
                    e.currentTarget.style.border = "1px solid rgba(0,84,202,0.25)";
                    e.currentTarget.style.boxShadow = "0 0 0 4px rgba(0,84,202,0.08)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.55)";
                    e.currentTarget.style.border = "1px solid rgba(255,255,255,0.70)";
                    e.currentTarget.style.boxShadow = "inset 0 1px 3px rgba(0,0,0,0.04)";
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[10px] font-bold tracking-[0.12em] text-slate-500 ml-1"
              >
                Password
              </label>
              <div className="relative group">
                <MsIcon
                  name="lock"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] transition-colors group-focus-within:text-blue-600"
                />
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full py-3.5 pl-11 pr-12 text-[13px] text-slate-800 placeholder:text-slate-400 transition-all focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.55)",
                    border: "1px solid rgba(255,255,255,0.70)",
                    borderRadius: 9999,
                    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.04)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.95)";
                    e.currentTarget.style.border = "1px solid rgba(0,84,202,0.25)";
                    e.currentTarget.style.boxShadow = "0 0 0 4px rgba(0,84,202,0.08)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.55)";
                    e.currentTarget.style.border = "1px solid rgba(255,255,255,0.70)";
                    e.currentTarget.style.boxShadow = "inset 0 1px 3px rgba(0,0,0,0.04)";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors"
                >
                  <MsIcon name={showPw ? "visibility_off" : "visibility"} className="text-[20px]" />
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="peer appearance-none w-5 h-5 rounded-md border-2 border-slate-300 checked:bg-blue-600 checked:border-blue-600 transition-all cursor-pointer focus:outline-none"
                  />
                  <MsIcon
                    name="check"
                    className="absolute inset-0 text-white text-[13px] opacity-0 peer-checked:opacity-100 transition-opacity flex items-center justify-center"
                    style={{ fontVariationSettings: "'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 16" } as React.CSSProperties}
                  />
                </div>
                <span className="text-[13px] font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                  Ingat saya
                </span>
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 text-red-700 text-[12px] font-medium rounded-2xl px-4 py-3">
                <MsIcon name="error" className="text-[16px] text-red-500 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 text-white font-bold py-3.5 rounded-full transition-all group disabled:opacity-70"
                style={{
                  background: loading
                    ? "linear-gradient(135deg, #0049b2, #0049b2)"
                    : "linear-gradient(135deg, #0054ca 0%, #2b70e8 100%)",
                  boxShadow: "0 8px 24px rgba(0,84,202,0.22)",
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,84,202,0.32)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,84,202,0.22)";
                }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    <span>Masuk...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk</span>
                    <MsIcon name="arrow_forward" className="text-[18px] transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* ── Demo accounts ────────────────────────────────── */}
          <div className="mt-7 pt-6 border-t border-white/60">
            <p className="text-[10px] font-bold tracking-[0.12em] text-slate-400 text-center mb-3">
              Akun Demo
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fillDemo("admin", "admin123")}
                className="flex-1 text-center py-2 px-3 rounded-2xl text-[11px] font-bold transition-all"
                style={{
                  background: "rgba(0,84,202,0.07)",
                  border: "1px solid rgba(0,84,202,0.12)",
                  color: "#0054ca",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,84,202,0.13)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,84,202,0.07)"; }}
              >
                <span className="block text-[10px] font-semibold text-blue-400 mb-0.5">Admin</span>
                admin / admin123
              </button>
              <button
                type="button"
                onClick={() => fillDemo("budi", "petugas123")}
                className="flex-1 text-center py-2 px-3 rounded-2xl text-[11px] font-bold transition-all"
                style={{
                  background: "rgba(99,61,212,0.07)",
                  border: "1px solid rgba(99,61,212,0.12)",
                  color: "#5e2fcb",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(99,61,212,0.13)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(99,61,212,0.07)"; }}
              >
                <span className="block text-[10px] font-semibold text-purple-400 mb-0.5">Petugas</span>
                budi / petugas123
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
