import { db, eventsTable, participantsTable, eventRegistrationsTable } from "./index";
import { sql, count } from "drizzle-orm";
import { jatimWilayah } from "./jatimWilayah";

const maleNames = [
  "Ahmad","Muhammad","Budi","Hendra","Agus","Rudi","Wahyu","Didi","Eko","Fajar",
  "Gunawan","Hadi","Irwan","Joko","Kurnia","Lukman","Mulyadi","Nanang","Oki","Purnomo",
  "Qomarudin","Rizki","Slamet","Taufik","Umar","Vicky","Wawan","Xander","Yusuf","Zainal",
  "Andi","Bambang","Cahyo","Dedi","Eri","Feri","Galih","Haris","Imam","Jaka",
  "Kevin","Luthfi","Marco","Niko","Otto","Prasetyo","Qodir","Rafi","Sandi","Tono",
  "Ujang","Vino","Wahid","Xavi","Yoga","Zulfikar","Arief","Bagas","Candra","Dani",
  "Edi","Fauzi","Gilang","Hanif","Ilham","Julian","Karim","Leon","Maulana","Nanda",
  "Oscar","Panji","Rama","Satria","Teguh","Udin","Victor","Widi","Yanto","Zaky",
];

const femaleNames = [
  "Siti","Dewi","Rina","Ani","Wati","Lestari","Fitri","Indah","Rini","Sari",
  "Nita","Dian","Yuni","Ika","Mega","Putri","Ayu","Nova","Tika","Hana",
  "Lina","Maya","Neni","Oki","Pipit","Rahma","Sinta","Tini","Utami","Vera",
  "Winda","Xena","Yola","Zahra","Adinda","Bella","Cantik","Desy","Elsa","Fina",
  "Gita","Hesti","Ita","Jasmine","Kartika","Laila","Mira","Nadia","Octa","Prita",
  "Qori","Ratna","Siska","Tuti","Ulfa","Vina","Windy","Xara","Yesi","Zulfa",
  "Amelia","Bunga","Clara","Dara","Erika","Feby","Gina","Hanna","Ines","Julia",
  "Kirana","Lola","Mutia","Nisa","Okta","Puja","Qonita","Rara","Salsa","Tiara",
];

const surnames = [
  "Santoso","Wijaya","Kusuma","Hartono","Setiawan","Prasetyo","Purnama","Suryadi",
  "Gunawan","Hidayat","Nugroho","Susanto","Wibowo","Sulistyo","Kurniawan","Andriani",
  "Firmansyah","Harahap","Situmorang","Lubis","Sihombing","Simanjuntak","Sinaga","Manurung",
  "Nasution","Siregar","Purba","Ginting","Saragih","Panjaitan","Hutabarat","Siagian",
  "Rahman","Rahim","Aziz","Hasan","Hussein","Ali","Abdullah","Ismail",
  "Mahmud","Saleh","Hamid","Yusuf","Ibrahim","Osman","Karim","Latif",
  "Saputra","Saputri","Permana","Perdana","Utama","Pratama","Utami","Pertiwi",
];

const staffNames = [
  "Budi Santoso","Rina Wati","Agus Purnomo","Dewi Lestari","Hendra Kurniawan",
  "Sari Utami","Fajar Nugroho","Mega Andriani","Wahyu Prasetyo","Indah Permata",
  "Rudi Setiawan","Fitri Handayani","Eko Susanto","Nita Wibowo","Dani Firmansyah",
  "Ayu Rahayu","Bagus Hidayat","Lestari Sari","Gilang Ramadhan","Tika Susanti",
];

const religions = ["Islam","Kristen","Katolik","Hindu","Buddha","Konghucu"];
const occupations = [
  "Karyawan Swasta","PNS","Wiraswasta","Petani","Pedagang","Guru","Dokter",
  "Mahasiswa","Pelajar","TNI/Polri","Buruh","Nelayan","Ibu Rumah Tangga","Freelancer",
  "Arsitek","Insinyur","Akuntan","Programmer","Desainer","Jurnalis","Perawat","Bidan",
];
const bloodTypes = ["A","B","AB","O","A+","B+","AB+","O+","A-","B-","AB-","O-"];
const maritalStatuses = ["Belum Kawin","Kawin","Cerai Hidup","Cerai Mati"];
const birthPlaces = [
  "Jakarta","Bandung","Surabaya","Medan","Semarang","Makassar","Palembang",
  "Yogyakarta","Denpasar","Manado","Balikpapan","Pekanbaru","Padang","Banjarmasin",
];

const eventTemplates = [
  { name: "Festival Budaya Reog Ponorogo 2024",     location: "Alun-alun Ponorogo",              date: "2024-01-15" },
  { name: "Pameran UMKM Jawa Timur Bangkit",        location: "GOR Pacitan, Pacitan",            date: "2024-02-10" },
  { name: "Seminar Pendidikan Kabupaten Ngawi",     location: "Pendopo Kabupaten Ngawi",         date: "2024-02-25" },
  { name: "Festival Kuliner Khas Trenggalek",       location: "Alun-alun Trenggalek",            date: "2024-03-05" },
  { name: "Sosialisasi Program Kesehatan Magetan",  location: "GOR Magetan",                     date: "2024-03-20" },
  { name: "Musyawarah Pembangunan Desa Pacitan",    location: "Balai Desa Pacitan",              date: "2024-04-12" },
  { name: "Peringatan Hari Kartini Ponorogo",       location: "Pendopo Ponorogo",                date: "2024-04-21" },
  { name: "Olahraga & Seni Masyarakat Ngawi",       location: "Stadion Ngawi",                   date: "2024-05-05" },
  { name: "Seminar Wirausaha Muda Trenggalek",      location: "Gedung Serbaguna Trenggalek",     date: "2024-05-18" },
  { name: "Lomba Karya Pemuda Magetan",             location: "Taman Sarangan, Magetan",         date: "2024-06-02" },
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}
function generateNIK(province: string, birthDate: string, gender: string, seq: number): string {
  const provCode = pad(randInt(11, 72), 2);
  const cityCode = pad(randInt(1, 30), 2);
  const kecCode  = pad(randInt(1, 30), 2);
  const [year, month, day] = birthDate.split("-");
  const dd = gender === "PEREMPUAN" ? String(parseInt(day) + 40).padStart(2, "0") : pad(parseInt(day));
  const mm = pad(parseInt(month));
  const yy = year.slice(2);
  const seqCode = pad(seq % 10000, 4);
  return `${provCode}${cityCode}${kecCode}${dd}${mm}${yy}${seqCode}`;
}
function generateBirthDate(): string {
  const year = randInt(1960, 2002);
  const month = randInt(1, 12);
  const day = randInt(1, 28);
  return `${year}-${pad(month)}-${pad(day)}`;
}
function randomDateInRange(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

export async function runSeedIfEmpty(): Promise<void> {
  const [evRow] = await db.select({ cnt: count() }).from(eventsTable);
  if (evRow && evRow.cnt > 0) {
    console.log(`[autoSeed] DB already has data (${evRow.cnt} events). Skipping seed.`);
    return;
  }

  console.log("[autoSeed] Empty database detected. Starting seed...");

  await db.execute(sql`TRUNCATE event_registrations, participants, events RESTART IDENTITY CASCADE`);

  const insertedEvents = await db.insert(eventsTable).values(
    eventTemplates.map((e) => ({
      name: e.name,
      description: `Event resmi penyelenggaraan ${e.name}`,
      location: e.location,
      eventDate: e.date,
    }))
  ).returning();
  console.log(`[autoSeed] ${insertedEvents.length} events created`);

  const TOTAL = 1000;
  const BATCH = 100;
  const participantIds: number[] = [];
  const nikSet = new Set<string>();

  for (let batch = 0; batch < TOTAL / BATCH; batch++) {
    const values = [];
    for (let i = 0; i < BATCH; i++) {
      const seq = batch * BATCH + i;
      const gender = Math.random() > 0.45 ? "LAKI-LAKI" : "PEREMPUAN";
      const firstName = gender === "LAKI-LAKI" ? rand(maleNames) : rand(femaleNames);
      const fullName = `${firstName} ${rand(surnames)}`;
      const birthDate = generateBirthDate();
      const province = "Jawa Timur";
      const kabupaten = rand(Object.keys(jatimWilayah));
      const city = kabupaten;
      const kecamatanKeys = Object.keys(jatimWilayah[kabupaten]);
      const kecamatanName = rand(kecamatanKeys);
      const kelurahanName = rand(jatimWilayah[kabupaten][kecamatanName]);

      let nik: string;
      let attempts = 0;
      do {
        nik = generateNIK(province, birthDate, gender, seq + attempts * 1000 + Math.floor(Math.random() * 100));
        attempts++;
      } while (nikSet.has(nik) && attempts < 20);
      nikSet.add(nik);

      values.push({
        nik,
        fullName,
        gender,
        birthDate,
        birthPlace: rand(["Pacitan","Trenggalek","Magetan","Ponorogo","Ngawi","Madiun","Surabaya","Malang"]),
        address: `Jl. ${rand(["Diponegoro","Ahmad Yani","Sudirman","Merdeka","Gajah Mada","Hayam Wuruk","Pahlawan","Soekarno"])} No. ${randInt(1, 200)}`,
        rtRw: `${pad(randInt(1, 15))}/${pad(randInt(1, 10))}`,
        kelurahan: kelurahanName,
        kecamatan: kecamatanName,
        city,
        province,
        religion: rand(religions),
        occupation: rand(occupations),
        bloodType: rand(bloodTypes),
        maritalStatus: rand(maritalStatuses),
        nationality: "WNI",
      });
    }
    const inserted = await db.insert(participantsTable).values(values).returning({ id: participantsTable.id });
    participantIds.push(...inserted.map((r) => r.id));
    if ((batch + 1) % 5 === 0) {
      console.log(`[autoSeed] ${participantIds.length} / ${TOTAL} participants`);
    }
  }

  const registrationMap = new Set<string>();
  const regValues: {
    eventId: number;
    participantId: number;
    staffName: string;
    registeredAt: Date;
    registrationType: string;
    checkedInAt: Date | null;
  }[] = [];

  const rsvpStart = new Date();
  rsvpStart.setDate(rsvpStart.getDate() - 21); // RSVP opened 3 weeks ago
  const rsvpEnd = new Date();
  rsvpEnd.setDate(rsvpEnd.getDate() - 1); // RSVP closed yesterday
  const checkinStart = new Date();
  checkinStart.setHours(7, 0, 0, 0); // Event starts 07:00
  const checkinEnd = new Date();
  checkinEnd.setHours(17, 0, 0, 0); // Event ends 17:00

  for (const pid of participantIds) {
    // 15% don't register at all, rest register for 1-3 events
    const numEvents = Math.random() < 0.15 ? 0
                    : Math.random() < 0.55 ? 1
                    : Math.random() < 0.85 ? 2 : 3;

    const shuffled = [...insertedEvents].sort(() => Math.random() - 0.5).slice(0, numEvents);
    for (const ev of shuffled) {
      const key = `${ev.id}-${pid}`;
      if (!registrationMap.has(key)) {
        registrationMap.add(key);
        // All seed registrations are RSVP (pre-registered)
        const registeredAt = randomDateInRange(rsvpStart, rsvpEnd);
        // ~78% of registered people actually show up
        const didAttend = Math.random() < 0.78;
        const checkedInAt = didAttend ? randomDateInRange(checkinStart, checkinEnd) : null;
        regValues.push({
          eventId: ev.id,
          participantId: pid,
          staffName: rand(staffNames),
          registeredAt,
          registrationType: "rsvp",
          checkedInAt,
        });
      }
    }
  }

  const REG_BATCH = 200;
  for (let i = 0; i < regValues.length; i += REG_BATCH) {
    await db.insert(eventRegistrationsTable).values(regValues.slice(i, i + REG_BATCH));
  }

  // Add a small number of on-the-spot (walk-in) participants per event
  // Pick ~8% of participants who didn't already register, and add them as onsite for 1 event
  const walkInPool = participantIds.filter(() => Math.random() < 0.08);
  const walkinValues: typeof regValues = [];
  for (const pid of walkInPool) {
    const ev = rand(insertedEvents);
    const key = `${ev.id}-${pid}`;
    if (!registrationMap.has(key)) {
      registrationMap.add(key);
      const walkinTime = randomDateInRange(checkinStart, checkinEnd);
      walkinValues.push({
        eventId: ev.id,
        participantId: pid,
        staffName: rand(staffNames),
        registeredAt: walkinTime,
        registrationType: "onsite",
        checkedInAt: walkinTime, // onsite = always present
      });
    }
  }
  for (let i = 0; i < walkinValues.length; i += REG_BATCH) {
    await db.insert(eventRegistrationsTable).values(walkinValues.slice(i, i + REG_BATCH));
  }

  console.log(`[autoSeed] Done! ${insertedEvents.length} events, ${participantIds.length} participants, ${regValues.length} registrations.`);
}
