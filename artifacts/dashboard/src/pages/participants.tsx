import { useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import {
  useListParticipants,
  getListParticipantsQueryKey,
} from "@workspace/api-client-react";

export default function ParticipantsPage() {
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const params = {
    ...(search ? { search } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };

  const { data: participants, isLoading } = useListParticipants(params, {
    query: { queryKey: getListParticipantsQueryKey(params) },
  });

  return (
    <Layout role="supervisor">
      <div className="space-y-4 md:space-y-5">
        <h1 className="text-[22px] md:text-[26px] font-extrabold text-slate-900 leading-tight" style={{ letterSpacing: "-0.03em" }}>
          Daftar Peserta
        </h1>

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Cari nama atau NIK..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[160px] rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-sm"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-sm"
          />
          {(search || startDate || endDate) && (
            <button
              onClick={() => { setSearch(""); setStartDate(""); setEndDate(""); }}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Reset
            </button>
          )}
        </div>

        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">NIK</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Nama Lengkap</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Kelamin</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Kota</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Pertama Daftar</th>
                  <th className="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Event</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Memuat...</td>
                  </tr>
                ) : participants && participants.length > 0 ? (
                  participants.map((p) => (
                    <tr key={p.nik} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-3 font-mono text-xs">{p.nik}</td>
                      <td className="px-5 py-3 font-medium">
                        <Link href={`/participants/${p.nik}`} className="hover:underline">
                          {p.fullName}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{p.gender ?? "-"}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.nationality ?? "-"}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {new Date(p.firstRegisteredAt).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${p.eventCount > 1 ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                          {p.eventCount}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                      Belum ada peserta
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {participants && (
            <div className="border-t px-5 py-2 text-xs text-muted-foreground">
              {participants.length} peserta unik terdaftar
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
