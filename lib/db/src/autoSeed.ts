import { db, eventsTable, participantsTable, eventRegistrationsTable } from "./index";
import { sql, count } from "drizzle-orm";

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

const jatimWilayah: Record<string, Record<string, string[]>> = {
  Pacitan: {
    Arjosari:   ["Arjosari","Borang","Gayuhan","Gegeran","Gembong","Gunungsari","Jatimalang","Jetis Kidul","Karanggede","Karangrejo","Kedungbendo","Mangunharjo","Mlati","Pagutan","Sedayu"],
    Bandar:     ["Bandar","Bangunsari","Jeruk","Kledung","Ngunut","Petungsinarang","Tumpuk","Watupatok"],
    Donorojo:   ["Belah","Cemeng","Donorojo","Gedompol","Gendaran","Kalak","Klepu","Sawahan","Sekar","Sendang","Sukodono","Widoro"],
    Kebonagung: ["Banjarjo","Gawang","Gembuk","Kalipelus","Karanganyar","Karangnongko","Katipugal","Kebonagung","Ketepung","Ketro","Klesem","Mantren","Plumbungan","Punjung","Purwoasri"],
    Nawangan:   ["Gondang","Jetis Lor","Mujing","Nawangan","Ngromo","Pakis Baru","Penggung","Sempu","Tokawi"],
    Ngadirojo:  ["Bodag","Bogoharjo","Cangkring","Cokrokembang","Hadiluwih","Hadiwarno","Ngadirojo","Nogosari","Pagerejo","Sidomulyo","Tanjung Lor","Tanjungpuro","Wiyoro","Wonoasri","Wonodadi Kulon"],
    Pacitan:    ["Arjowinangun","Bangunsari","Banjarsari","Bolosingo","Kayen","Kembang","Menadi","Mentoro","Nanggungan","Ponggok","Purworejo","Sambong","Sedeng","Semanten","Sirnoboyo"],
    Pringkuku:  ["Candi","Dadapan","Dersono","Glinggangan","Jlubang","Ngadirejan","Pelem","Poko","Pringkuku","Sobo","Sugihwaras","Tamanasri","Watukarung"],
    Punung:     ["Bomo","Gondosari","Kebonsari","Kendal","Mantren","Mendolo Kidul","Mendolo Lor","Piton","Ploso","Punung","Sooka","Tinatar","Wareng"],
    Sudimoro:   ["Gunungrejo","Karangmulyo","Ketanggung","Klepu","Pager Kidul","Pager Lor","Sembowo","Sudimoro","Sukorejo","Sumberejo"],
    Tegalombo:  ["Gedangan","Gemaharjo","Kasihan","Kebondalem","Kemuning","Ngreco","Ploso","Pucangombo","Tahunan","Tahunan Baru","Tegalombo"],
    Tulakan:    ["Bubakan","Bungur","Gasang","Jatigunung","Jetak","Kalikuning","Ketro","Ketro Harjo","Kluwih","Losari","Ngile","Nglaran","Ngumbul","Padi","Tulakan"],
  },
  Trenggalek: {
    Panggul:    ["Banjar","Barang","Besuki","Bodag","Depok","Gayam","Karangtengah","Kertosono","Manggis","Nglebeng","Ngrambingan","Ngrencak","Panggul","Sawahan","Tangkil"],
    Munjungan:  ["Bangun","Bendoroto","Besuki","Craken","Karangturi","Masaran","Munjungan","Ngulungkulon","Ngulungwetan","Sobo","Tawing"],
    Pule:       ["Joho","Jombok","Karanganyar","Kembangan","Pakel","Pule","Puyung","Sidomulyo","Sukokidul","Tanggaran"],
    Dongko:     ["Cakul","Dongko","Ngerdani","Pandean","Petung","Pringapus","Salam Wates","Siki","Sumber Bening","Watuagung"],
    Tugu:       ["Banaran","Dermosari","Duren","Gading","Gondang","Jambu","Ngepeh","Nglinggis","Nglongsor","Prambon","Pucanganak","Sukorejo","Tegaren","Tumpuk","Winong"],
    Karangan:   ["Buluagung","Jati","Jatiprahu","Karangan","Kayen","Kedungsigit","Kerjo","Ngentrong","Salamrejo","Sumber","Sumberingin"],
    Kampak:     ["Bendoagung","Bogoran","Karangrejo","Ngadimulyo","Senden","Sugihan","Timahan"],
    Watulimo:   ["Dukuh","Gemaharjo","Karanggandu","Margomulyo","Ngembel","Pakel","Prigi","Sawahan","Slawe","Tasikmadu","Watuagung","Watulimo"],
    Bendungan:  ["Botoputih","Depok","Dompyong","Masaran","Sengon","Srabah","Sumurup","Suren Lor"],
    Gandusari:  ["Gandusari","Jajar","Karanganyar","Krandegan","Melis","Ngrayung","Sukorame","Sukorejo","Widoro","Wonoanti","Wonorejo"],
    Trenggalek: ["Dawuhan","Karangsoko","Kelutan","Ngantru","Ngares","Parakan","Rejowinangun","Sambirejo","Sukosari","Sumberdadi","Sumbergedong","Surodakan","Tamanan"],
    Pogalan:    ["Bendorejo","Gembleb","Kedunglurah","Ngadirejo","Ngadirenggo","Ngetal","Ngulankulon","Ngulanwetan","Pogalan","Wonocoyo"],
    Durenan:    ["Baruharjo","Durenan","Gador","Kamulan","Karanganom","Kendal Rejo","Malasan","Ngadisuko","Pakis","Pandean","Panggungsari","Semarum","Sumberejo","Sumbergayam"],
    Suruh:      ["Gamping","Mlinjon","Nglebo","Ngrandu","Ngrencak","Puru","Suruh","Tempel","Tugu","Wonokerto"],
  },
  Magetan: {
    Barat:        ["Bangunasri","Banjarejo","Blaran","Bogorejo","Jonggrang","Karangsono","Klagen","Manjung","Ngumpul","Panggung","Purwodadi","Rejomulyo","Mangge","Tebon"],
    Bendo:        ["Belotan","Bulak","Bulugledeg","Carikan","Dukuh","Duwet","Kinandang","Kleco","Kledokan","Lemahbang","Pingkuk","Setren","Soco","Tanjung","Tegalarum"],
    Karangrejo:   ["Baluk","Gebyok","Gondang","Grabahan","Karangrejo","Kauman","Manisrejo","Mantren","Maron","Patihan","Pelem","Prampelan","Sambirembe"],
    Karas:        ["Botok","Geplak","Ginuk","Jungke","Karas","Kuwon","Sobontoro","Sumursongo","Taji","Temboro","Temenggungan"],
    Kartoharjo:   ["Bayem Taman","Bayem Wetan","Gunungan","Jajar","Jeruk","Karangmojo","Kartoharjo","Klurahan","Mrahu","Ngelang","Pencol","Sukowidi"],
    Kawedanan:    ["Balerejo","Bogem","Garon","Genengan","Giripurno","Jambangan","Karangrejo","Mangunrejo","Mojorejo","Ngadirejo","Ngentep","Ngunut","Pojok","Selorejo","Sugihrejo"],
    Lembeyan:     ["Dukuh","Kediren","Kedungpanji","Krowe","Lembeyan Kulon","Lembeyan Wetan","Nguri","Pupus","Tapen","Tunggur"],
    Magetan:      ["Baron","Bulukerto","Candirejo","Kebonagung","Kepolorejo","Magetan","Mangkujayan","Purwosari","Ringinagung","Selosari","Sukowinangun","Tambakrejo","Tawanganom","Tambran"],
    Maospati:     ["Gulun","Klagen Gambiran","Kraton","Malang","Maospati","Mranggen","Ngujung","Pandeyan","Pesu","Ronowijayan","Sempol","Sugihwaras","Sumberejo","Suratmajan","Tanjungsepreh"],
    Ngariboyo:    ["Baleasri","Balegondo","Bangsri","Banjarejo","Banjarpanjang","Banyudono","Mojopurno","Ngariboyo","Pendem","Selopanggung","Selotinatah","Sumberdukun"],
    Nguntoronadi: ["Driyorejo","Gorang-Gareng","Kenongomulyo","Nguntoronadi","Petungrejo","Purworejo","Semen","Simbatan","Sukowidi"],
    Panekan:      ["Banjarejo","Bedagung","Cepoko","Jabung","Manjung","Milangasri","Ngiliran","Rejomulyo","Sidowayah","Sukowidi","Sumberdodol","Tanjungsari","Tapak","Terung","Turi"],
    Parang:       ["Bungkuk","Joketro","Krajan","Mategal","Ngaglik","Nglopang","Ngunut","Parang","Pragak","Sayutan","Sundul","Tamanarum","Trosono"],
    Plaosan:      ["Bogoarum","Bulugunung","Buluharjo","Dadi","Ngancar","Nitikan","Pacalan","Plaosan","Plumpung","Puntukdoro","Randugede","Sarangan","Sendangagung","Sidomukti","Sumberagung"],
    Poncol:       ["Alastuwo","Cileng","Genilangit","Gonggang","Janggan","Plangkrongan","Poncol","Sombo"],
    Sidorejo:     ["Campursari","Durenan","Getasanyar","Kalang","Sambirobyong","Sidokerto","Sidomulyo","Sidorejo","Sumbersawit","Widorokandang"],
    Sukomoro:     ["Bandar","Bibis","Bogem","Bulu","Kalangketi","Kedungguwo","Kembangan","Kentangan","Pojoksari","Sukomoro","Tamanan","Tambakmas","Tinap","Truneng"],
    Takeran:      ["Duyung","Jomblang","Kepuhrejo","Kerang","Kerik","Kiringan","Kuwonharjo","Madigondo","Sawojajar","Takeran","Tawangrejo","Waduk"],
  },
  Ponorogo: {
    Babadan:    ["Babadan","Bareng","Cekok","Gupolo","Japan","Kadipaten","Kertosari","Lembah","Ngunut","Patihan Wetan","Pondok","Polorejo","Purwosari","Sukosari","Trisono"],
    Badegan:    ["Badegan","Bandaralim","Biting","Dayakan","Kapuran","Karangan","Karangjoho","Tanjunggunung","Tanjungrejo","Watubonang"],
    Balong:     ["Bajang","Balong","Bulak","Bulukidul","Dadapan","Jalen","Karangan","Karangmojo","Karangpatihan","Muneng","Ngampel","Ngendut","Ngraket","Ngumpul","Pandak"],
    Bungkal:    ["Bancar","Bedikulon","Bediwetan","Bekare","Belang","Bungkal","Bungu","Kalisat","Ketonggo","Koripan","Kunti","Kupuk","Kwajon","Munggu","Nambak"],
    Jambon:     ["Blembem","Bringinan","Bulu Lor","Jambon","Jonggol","Karanglo Kidul","Krebet","Menang","Poko","Pulosari","Sendang","Sidoharjo","Srandil"],
    Jenangan:   ["Jenangan","Jimbe","Kemiri","Mrican","Nglayang","Ngrupit","Panjeng","Paringan","Pintu","Plalangan","Sedah","Semanding","Sraten","Tanjungsari","Wates"],
    Jetis:      ["Coper","Jetis","Josari","Karanggebang","Kradenan","Kutukulon","Kutuwetan","Mojomati","Mojorejo","Ngasinan","Tegalsari","Turi","Winong","Wonoketro"],
    Kauman:     ["Bringin","Carat","Ciluk","Gabel","Kauman","Maron","Nglarangan","Ngrandu","Nongkodono","Pengkol","Plosojenar","Semanding","Somoroto","Sukosari","Tegalombo"],
    Mlarak:     ["Bajang","Candi","Gandu","Gontor","Jabung","Joresan","Kaponan","Mlarak","Nglumpang","Ngrukem","Serangan","Siwalan","Suren","Totokan","Tugu"],
    Ngebel:     ["Gondowido","Ngebel","Ngrogung","Pupus","Sahang","Sempu","Talun","Wagir Lor"],
    Ngrayun:    ["Baosankidul","Baosanlor","Binade","Cepoko","Gedangan","Mrayan","Ngrayun","Selur","Sendang","Temon","Wonodadi"],
    Ponorogo:   ["Bangunsari","Banyudono","Beduri","Brotonegaran","Cokromenggalan","Jingglong","Kauman","Keniten","Kepatihan","Mangkujayan","Nologaten","Paju","Pakunden","Pinggirsari","Purbosuman"],
    Pudak:      ["Banjarjo","Bareng","Krisik","Pudak Kulon","Pudak Wetan","Tambang"],
    Pulung:     ["Banaran","Bedrug","Bekiring","Karangpatihan","Kesugihan","Munggung","Patik","Plunturan","Pomahan","Pulung","Pulung Merdiko","Serag","Sidoharjo","Singgahan","Tegalrejo"],
    Sambit:     ["Bancangan","Bangsalan","Bedingin","Besuki","Bulu","Campurejo","Campursari","Gajah","Jrakah","Kemuning","Maguwan","Ngadisanan","Nglewan","Sambit","Wilangan"],
    Sampung:    ["Carangrejo","Gelangkulon","Glinggang","Jenangan","Karangwaluh","Kunti","Nglurup","Pagerukir","Pohijo","Ringinputih","Sampung","Tulung"],
    Sawoo:      ["Bondrang","Grogol","Ketro","Kori","Ngindeng","Pangkal","Prayungan","Sawoo","Sriti","Temon","Tempuran","Tugurejo","Tumpakpelem","Tumpuk"],
    Siman:      ["Beton","Brahu","Demangan","Jarak","Kepuhrubuh","Madusari","Manuk","Ngabar","Patihan Kidul","Pijeran","Ronosentanan","Sawuh","Sekaran","Siman","Tajug"],
    Slahung:    ["Broto","Caluk","Crabak","Duri","Galak","Gombang","Gundik","Janti","Jebeng","Kambeng","Menggare","Mojopitu","Nailan","Ngilo-ilo","Ngloning"],
    Sooko:      ["Bedoho","Jurug","Klepu","Ngadirojo","Sooko","Suru"],
    Sukorejo:   ["Bangunrejo","Gandukepuh","Gegeran","Gelanglor","Golan","Kalimalang","Karanglolor","Kedungbanteng","Kranggan","Lengkong","Morosari","Nambangrejo","Nampan","Prajegan","Serangan"],
  },
  Ngawi: {
    Bringin:     ["Bringin","Dampit","Dero","Gandong","Kenongorejo","Krompol","Lego Wetan","Mojo","Sumberbening","Suruh"],
    Geneng:      ["Baderan","Dempel","Geneng","Kasreman","Keniten","Keras Wetan","Kersikan","Kersoharjo","Klampisan","Klitik","Sidorejo","Tambakromo","Tepas"],
    Gerih:       ["Gerih","Guyung","Keras Kulon","Randusongo","Widodaren"],
    Jogorogo:    ["Brubuh","Dawung","Girimulyo","Jaten","Jogorogo","Kletekan","Macanan","Ngrayudan","Soco","Talang","Tanjungsari","Umbulrejo"],
    Karanganyar: ["Bangunrejo","Gembol","Karanganyar","Mengger","Pandean","Sekarjati","Sriwedari"],
    Karangjati:  ["Brangol","Campurasri","Danguk","Dungmiri","Gempol","Jatipuro","Karangjati","Legundi","Ploso Lor","Puhti","Rejomulyo","Rejuno","Ringin Anom","Sawo","Sembung"],
    Kasreman:    ["Cangakan","Gunungsari","Jatirejo","Karangmalang","Kasreman","Kiyonten","Lego Kulon","Tawun"],
    Kedunggalar: ["Bangunrejo Kidul","Begal","Gemarang","Jatigembol","Jenggrik","Katikan","Kawu","Kedunggalar","Pelang Kidul","Pelang Lor","Wonokerto","Wonorejo"],
    Kendal:      ["Dadapan","Gayam","Karanggupito","Karangrejo","Kendal","Majasem","Patalan","Ploso","Sidorejo","Simo"],
    Kwadungan:   ["Banget","Budug","Dinden","Jenangan","Karangsono","Kendung","Kwadungan","Mojomanis","Pojok","Purwosari","Simo","Sumengko","Tirak","Warukkalong"],
    Mantingan:   ["Jatimulyo","Kedungharjo","Mantingan","Pakah","Pengkol","Sambirejo","Tambakboyo"],
    Ngawi:       ["Banyuurip","Beran","Grudo","Jururejo","Kandangan","Karang Asri","Karangtengah","Kartoharjo","Kerek","Ketanggi","Mangunharjo","Margomulyo","Ngawi","Watualang"],
    Ngrambe:     ["Babadan","Cepoko","Giriharjo","Hargomulyo","Krandegan","Manisharjo","Mendiro","Ngrambe","Pucangan","Sambirejo","Setono","Sidomulyo","Tawangrejo","Wakah"],
    Padas:       ["Banjaransari","Bendo","Bintoyo","Kedungprahu","Kwadungan Lor","Munggut","Pacing","Padas","Sambiroto","Sukowiyono","Tambakromo","Tungkulrejo"],
    Pangkur:     ["Babadan","Gandri","Ngompro","Pangkur","Paras","Pleset","Pohkonyal","Sumber","Waruk Tengah"],
    Paron:       ["Babadan","Dawu","Gelung","Gentong","Jambangan","Jeblogan","Jambangan","Kedungputri","Kebon","Ngale","Paron","Semen","Sirigan","Teguhan","Tempuran"],
    Pitu:        ["Bangunrejo Lor","Banjarbanggi","Cantel","Dumplengan","Kalang","Karanggeneng","Ngancar","Papungan","Pitu","Selopuro"],
    Sine:        ["Gendol","Girikerto","Hargosari","Jagir","Kauman","Ketanggung","Kuniran","Ngrendeng","Pandansari","Pocol","Sine","Sumbersari","Sumberejo","Tulakan","Wonosari"],
    Widodaren:   ["Banyubiru","Gendingan","Karangbanyu","Kauman","Kayutrejo","Kedunggudel","Sekaralas","Sekarputih","Sidolaju","Sidomakmur","Walikukun","Widodaren"],
  },
};

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
