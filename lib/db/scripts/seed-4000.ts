import { db, participantsTable, eventsTable, eventRegistrationsTable } from "../src/index";
import { sql } from "drizzle-orm";
import { jatimWilayah } from "../src/jatimWilayah";

// ─── Indonesian data pools ────────────────────────────────────────────────────

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
  { name: "Festival Budaya Nusantara 2024", location: "Gelora Bung Karno, Jakarta", date: "2024-01-15" },
  { name: "Pameran UMKM Indonesia Bangkit", location: "Jakarta Convention Center", date: "2024-02-10" },
  { name: "Seminar Nasional Pendidikan", location: "Universitas Indonesia, Depok", date: "2024-02-25" },
  { name: "Festival Kuliner Khas Daerah", location: "Lapangan Banteng, Jakarta", date: "2024-03-05" },
  { name: "Konser Amal Peduli Bangsa", location: "Istora Senayan, Jakarta", date: "2024-03-20" },
  { name: "Expo Teknologi & Inovasi 2024", location: "ICE BSD, Tangerang", date: "2024-04-12" },
  { name: "Peringatan Hari Kartini", location: "Balai Kota Jakarta", date: "2024-04-21" },
  { name: "Festival Olahraga Masyarakat", location: "GBK Complex, Jakarta", date: "2024-05-05" },
  { name: "Seminar Wirausaha Muda", location: "Mall Kelapa Gading, Jakarta", date: "2024-05-18" },
  { name: "Lomba Cipta Karya Pemuda", location: "Taman Mini Indonesia Indah", date: "2024-06-02" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const kecCode = pad(randInt(1, 30), 2);

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

// ─── Main Seed ────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Clearing existing data...");
  await db.execute(sql`TRUNCATE event_registrations, participants, events RESTART IDENTITY CASCADE`);

  // Insert events
  console.log("📅 Creating events...");
  const insertedEvents = await db.insert(eventsTable).values(
    eventTemplates.map((e) => ({
      name: e.name,
      description: `Event resmi penyelenggaraan ${e.name}`,
      location: e.location,
      eventDate: e.date,
    }))
  ).returning();
  console.log(`   ✓ ${insertedEvents.length} events created`);

  // Generate 4000 participants
  console.log("👥 Generating 4000 participants...");
  const TOTAL = 4000;
  const BATCH = 200;
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
      console.log(`   ✓ ${participantIds.length} / ${TOTAL} peserta`);
    }
  }

  // Generate registrations — spread over 90 days
  console.log("📋 Generating registrations...");
  const registrationMap = new Set<string>(); // "eventId-participantId"
  const regValues: { eventId: number; participantId: number; registeredAt: Date }[] = [];

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);

  // ~80% of participants join at least 1 event
  // ~25% join 2+ events
  for (const pid of participantIds) {
    const numEvents = Math.random() < 0.20 ? 0
                    : Math.random() < 0.60 ? 1
                    : Math.random() < 0.80 ? 2
                    : Math.random() < 0.90 ? 3
                    : 4;

    const shuffled = [...insertedEvents].sort(() => Math.random() - 0.5).slice(0, numEvents);
    for (const ev of shuffled) {
      const key = `${ev.id}-${pid}`;
      if (!registrationMap.has(key)) {
        registrationMap.add(key);
        regValues.push({
          eventId: ev.id,
          participantId: pid,
          staffName: staffNames[Math.floor(Math.random() * staffNames.length)],
          registeredAt: randomDateInRange(startDate, endDate),
        });
      }
    }
  }

  // Insert registrations in batches
  const REG_BATCH = 500;
  for (let i = 0; i < regValues.length; i += REG_BATCH) {
    await db.insert(eventRegistrationsTable).values(regValues.slice(i, i + REG_BATCH));
  }

  console.log(`   ✓ ${regValues.length} registrations created`);

  // Summary
  const totalReg = regValues.length;
  const multiEventCount = participantIds.filter((pid) => {
    let count = 0;
    for (const ev of insertedEvents) {
      if (registrationMap.has(`${ev.id}-${pid}`)) count++;
    }
    return count >= 2;
  }).length;

  console.log("\n🎉 Seed complete!");
  console.log(`   Participants : ${participantIds.length}`);
  console.log(`   Events       : ${insertedEvents.length}`);
  console.log(`   Registrations: ${totalReg}`);
  console.log(`   Multi-event  : ${multiEventCount}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
