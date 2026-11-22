import { translateKey } from '../locales/translations';

const CROP_TEXT_OVERRIDES = {
  kangkung: {
    zh: {
      name: '空心菜',
      climate: '热带 / 低地',
      substrateMix: '纯水洗椰糠或椰糠 + 珍珠岩 (80:20)',
      towerPlacement: '中上层槽位，光照充足',
      technicalNote: '极耐高温且喜湿润椰糠，最适合作为快速生长的默认作物配置。',
    },
    jv: {
      name: 'Kangkung',
      climate: 'Tropis / Dhataran Cendhek',
      substrateMix: 'Cocopeat murni resik utawa cocopeat + perlite (80:20)',
      towerPlacement: 'Slot tengah–ndhuwur sing kena srengenge kebak',
      technicalNote: 'Tahan panas banget lan seneng cocopeat teles; cocog dadi profil tanduran gawan paling cepet.',
    },
    ban: {
      name: 'Kangkung',
      climate: 'Tropis / Dataran Rendah',
      substrateMix: 'Cocopeat murni kedas utawa cocopeat + perlite (80:20)',
      towerPlacement: 'Slot tengah–duur sane polih sunar surya jangkep',
      technicalNote: 'Tahan panes pisan lan demen ring cocopeat belus; patut dados profil tanduran gawan pinih gelis.',
    },
  },
  pakcoy: {
    zh: {
      name: '小白菜（油菜）',
      climate: '热带 / 温和',
      substrateMix: '水洗椰糠 + 珍珠岩/稻壳炭 (80:20)',
      towerPlacement: '中层槽位，光照均匀且通风良好',
      technicalNote: '临近采收时蒸腾作用显著增加，第 3 至第 4 周需保持基质湿度稳定。',
    },
    jv: {
      name: 'Pakcoy',
      climate: 'Tropis / Sedhengan',
      substrateMix: 'Cocopeat resik + perlite/sekam obong (80:20)',
      towerPlacement: 'Slot tengah kanthi cahya rata lan sirkulasi hawa lancar',
      technicalNote: 'Evapotranspirasi mundhak dhuwur nyedhaki panen; jaga kelembapan tetep ajeg ing minggu kaping-3 lan kaping-4.',
    },
    ban: {
      name: 'Pakcoy',
      climate: 'Tropis / Sedeng',
      substrateMix: 'Cocopeat kedas + perlite/sekam puwun (80:20)',
      towerPlacement: 'Slot tengah antuk sunar rata lan angin lancar',
      technicalNote: 'Evapotranspirasi munggah tegeh nampekin panen; jaga kelembaban mangda stabil ring minggu kaping-3 lan kaping-4.',
    },
  },
  bayam: {
    zh: {
      name: '苋菜 / 菠菜',
      climate: '热带 / 温和',
      substrateMix: '椰糠 + 稻壳炭/珍珠岩 (70:30)',
      towerPlacement: '中下层槽位，避开强烈直射高温',
      technicalNote: '纯椰糠对根系偏致密，建议使用椰糠与稻壳炭/珍珠岩 70:30 混合基质。',
    },
    jv: {
      name: 'Bayem',
      climate: 'Tropis / Sedhengan',
      substrateMix: 'Cocopeat + sekam obong/perlite (70:30)',
      towerPlacement: 'Slot tengah–ngisor sing ora pati panas banget',
      technicalNote: 'Cocopeat murni kepadheten kanggo oyod bayem; disaranake campuran cocopeat + sekam obong/perlite (70:30).',
    },
    ban: {
      name: 'Bayem',
      climate: 'Tropis / Sedeng',
      substrateMix: 'Cocopeat + sekam puwun/perlite (70:30)',
      towerPlacement: 'Slot tengah–sor sane nenten kelangkung panes',
      technicalNote: 'Cocopeat murni kelangkung padet antuk akah bayem; kaprayogayang campuran cocopeat + sekam puwun/perlite (70:30).',
    },
  },
  basil: {
    zh: {
      name: '甜罗勒 / 九层塔',
      climate: '热带 / 温暖',
      substrateMix: '椰糠 + 珍珠岩/稻壳炭 (65:35)，加快排水',
      towerPlacement: '上层槽位，接受充足阳光',
      technicalNote: '过湿易烂根，两次灌溉之间需要更长的回干间隔。',
    },
    jv: {
      name: 'Kemangi / Sweet Basil',
      climate: 'Tropis / Anget',
      substrateMix: 'Cocopeat + perlite/sekam obong (65:35) supaya banyu cepet mili',
      towerPlacement: 'Slot ndhuwur sing entuk cahya srengenge optimal',
      technicalNote: 'Gampang bosok oyod yen kebacut teles; butuh wektu rada garing luwih suwe antarane jadwal siram.',
    },
    ban: {
      name: 'Kemangi / Sweet Basil',
      climate: 'Tropis / Anget',
      substrateMix: 'Cocopeat + perlite/sekam puwun (65:35) mangda toya gelis tedun',
      towerPlacement: 'Slot duur sane polih sunar surya optimal',
      technicalNote: 'Aluh berek akah yan kelangkung belus; perlu jeda tuh langkung suwe pantaraning irigasi.',
    },
  },
  selada: {
    zh: {
      name: '生菜',
      climate: '凉爽 / 室内',
      substrateMix: '水洗椰糠 + 珍珠岩 (75:25)',
      towerPlacement: '阴凉/半室内一侧，保持叶温低于 28°C',
      technicalNote: '温度高于 28°C 会导致叶片发苦并提早抽薹，宜置于较阴凉一侧。',
    },
    jv: {
      name: 'Selada',
      climate: 'Adhem / Indoor',
      substrateMix: 'Cocopeat resik + perlite (75:25)',
      towerPlacement: 'Sisih sing luwih eyup / semi-indoor supaya suhu godhong tetep ing ngisor 28°C',
      technicalNote: 'Suhu luwih saka 28°C ndadekake godhong pait lan cepet ngembang (bolting); becike diselehake ing sisih sing luwih eyup.',
    },
    ban: {
      name: 'Selada',
      climate: 'Tis / Indoor',
      substrateMix: 'Cocopeat kedas + perlite (75:25)',
      towerPlacement: 'Sisi sane tis / semi-indoor mangda suhu don tetep ring sor 28°C',
      technicalNote: 'Suhu duur 28°C ngawinang don pait lan gelis masekar (bolting); patut kagenahang ring sisi sane tis.',
    },
  },
  mint: {
    zh: {
      name: '薄荷',
      climate: '凉爽 / 温和',
      substrateMix: '椰糠 + 稻壳炭/珍珠岩 (75:25)',
      towerPlacement: '独立槽位，防止匍匐茎和根系侵占邻近槽位',
      technicalNote: '根系扩张力强，最好种植在独立槽位中，避免挤压其他作物根系。',
    },
    jv: {
      name: 'Mint',
      climate: 'Adhem / Sedhengan',
      substrateMix: 'Cocopeat + sekam obong/perlite (75:25)',
      towerPlacement: 'Slot kapisah supaya oyod lan rimpang ora nembus slot liyane',
      technicalNote: 'Oyode thukul cepet lan agresif; luwih becik ditandur ing slot kapisah supaya ora ngregem oyod tanduran liya.',
    },
    ban: {
      name: 'Mint',
      climate: 'Tis / Sedeng',
      substrateMix: 'Cocopeat + sekam puwun/perlite (75:25)',
      towerPlacement: 'Slot mapasahan mangda akah lan rimpang nenten ngranjing ka slot lianan',
      technicalNote: 'Akah mentik agresif; pinih becik katandur ring slot mapasahan mangda nenten ngaletehin akah tanduran lianan.',
    },
  },
  seledri: {
    zh: {
      name: '芹菜',
      climate: '凉爽 / 室内',
      substrateMix: '细水洗椰糠 + 珍珠岩 (80:20)，保持水分均匀',
      towerPlacement: '阴凉/凉爽室内一侧，避免超过 28°C 的直射高温',
      technicalNote: '根系很浅，椰糠一干就会迅速萎蔫；温度超过 28°C 时生长放缓。',
    },
    jv: {
      name: 'Seledri',
      climate: 'Adhem / Indoor',
      substrateMix: 'Cocopeat resik alus + perlite (80:20) kanggo njaga banyu rata',
      towerPlacement: 'Sisih eyup / indoor adhem; hindari panas langsung > 28°C',
      technicalNote: 'Oyode cethek banget lan cepet alum yen cocopeat garing; tuwuhe alon yen suhu luwih saka 28°C.',
    },
    ban: {
      name: 'Seledri',
      climate: 'Tis / Indoor',
      substrateMix: 'Cocopeat kedas alus + perlite (80:20) mangda toya rata',
      towerPlacement: 'Sisi tis / indoor; kelidin panas langsung > 28°C',
      technicalNote: 'Akah dangkal pisan lan gelis layu yan cocopeat tuh; panumbuhanne alon ring suhu duur 28°C.',
    },
  },
  stroberi: {
    zh: {
      name: '草莓',
      climate: '凉爽 / 控温',
      substrateMix: '椰糠 + 珍珠岩/稻壳炭 (70:30)，增强根系透气',
      towerPlacement: '中上层槽位，光照充足且有凉爽气流',
      technicalNote: '在垂直椰糠种植塔中产量高，但温度超过 26–28°C 时开花与果实品质会明显下降。',
    },
    jv: {
      name: 'Stroberi',
      climate: 'Adhem / Kakontrol',
      substrateMix: 'Cocopeat + perlite/sekam obong (70:30) kanggo aerasi oyod sing apik',
      towerPlacement: 'Slot tengah–ndhuwur kanthi cahya cukup lan aliran angin adhem',
      technicalNote: 'Produktif banget ing menara vertikal cocopeat, nanging kualitas kembang lan woh mudhun drastis yen suhu luwih saka 26–28°C.',
    },
    ban: {
      name: 'Stroberi',
      climate: 'Tis / Kakontrol',
      substrateMix: 'Cocopeat + perlite/sekam puwun (70:30) antuk aerasi akah sane becik',
      towerPlacement: 'Slot tengah–duur antuk sunar cukup lan angin tis',
      technicalNote: 'Produktif pisan ring menara vertikal cocopeat, nanging kualitas sekar lan woh tedun drastis ring suhu duur 26–28°C.',
    },
  },
  custom: {
    zh: {
      name: '自定义 (AI)',
      climate: '按环境自适应',
      substrateMix: '水洗椰糠 + 稻壳炭/珍珠岩 (70:30)',
      towerPlacement: '根据 AI 垂直适配分析调整',
      technicalNote: '输入作物名称，由 AI 农艺师评估垂直椰糠塔适配性与水泵滞回阈值。',
    },
    jv: {
      name: 'Kustom (AI)',
      climate: 'Miturut Konteks',
      substrateMix: 'Cocopeat resik + sekam obong/perlite (70:30)',
      towerPlacement: 'Nyelarasake analisis kelayakan vertikal AI',
      technicalNote: 'Lebokna jeneng tanduran supaya Agronomis AI ngevaluasi kelayakan vertikal cocopeat lan wates histeresis pompa.',
    },
    ban: {
      name: 'Kustom (AI)',
      climate: 'Manut Konteks',
      substrateMix: 'Cocopeat kedas + sekam puwun/perlite (70:30)',
      towerPlacement: 'Nganutin analisis kelayakan vertikal AI',
      technicalNote: 'Ranjingang wastan tanduran mangda Agronomis AI ngevaluasi kelayakan vertikal cocopeat lan wates histeresis pompa.',
    },
  },
};

export const SMART_CROPS = [
  {
    key: 'kangkung',
    name: 'Kangkung',
    nameEn: 'Water Spinach',
    scientificName: 'Ipomoea aquatica',
    climate: 'Tropis / Dataran Rendah',
    climateEn: 'Tropical / Lowland',
    minHst: 21,
    maxHst: 30,
    cycle: 30,
    harvestType: 'sekali_panen',
    soil: '65-80%',
    temp: '25-30°C',
    minSoil: 65,
    maxSoil: 80,
    criticalDry: 45,
    overwaterAlert: 85,
    minTemp: 25,
    maxTemp: 30,
    maxTolerance: 32,
    minHum: 65,
    maxHum: 85,
    substrateMix: 'Cocopeat murni terbilas atau cocopeat + perlite (80:20)',
    substrateMixEn: 'Pure rinsed cocopeat or cocopeat + perlite (80:20)',
    towerPlacement: 'Slot tengah–atas dengan intensitas cahaya matahari penuh',
    towerPlacementEn: 'Upper–middle slots with full sunlight exposure',
    technicalNote: 'Sangat toleran panas dan menyukai cocopeat basah; cocok sebagai profil default tercepat.',
    technicalNoteEn: 'Highly heat-tolerant and thrives in moist cocopeat; ideal as the fastest default crop profile.',
  },
  {
    key: 'pakcoy',
    name: 'Pakcoy',
    nameEn: 'Bok Choy',
    scientificName: 'Brassica rapa subsp. chinensis',
    climate: 'Tropis / Sedang',
    climateEn: 'Tropical / Moderate',
    minHst: 25,
    maxHst: 35,
    cycle: 35,
    harvestType: 'sekali_panen',
    soil: '60-75%',
    temp: '19-27°C',
    minSoil: 60,
    maxSoil: 75,
    criticalDry: 45,
    overwaterAlert: 85,
    minTemp: 19,
    maxTemp: 27,
    maxTolerance: 30,
    minHum: 60,
    maxHum: 85,
    substrateMix: 'Cocopeat terbilas + perlite/sekam bakar (80:20)',
    substrateMixEn: 'Rinsed cocopeat + perlite/rice husk charcoal (80:20)',
    towerPlacement: 'Slot tengah dengan pencahayaan merata dan sirkulasi udara lancar',
    towerPlacementEn: 'Middle slots with even light and steady airflow',
    technicalNote: 'Evapotranspirasi naik drastis menjelang panen; jaga kelembapan stabil di minggu ke-3 dan ke-4.',
    technicalNoteEn: 'Evapotranspiration surges close to harvest; keep moisture steady during weeks 3 and 4.',
  },
  {
    key: 'bayam',
    name: 'Bayam',
    nameEn: 'Spinach',
    scientificName: 'Amaranthus tricolor',
    climate: 'Tropis / Sedang',
    climateEn: 'Tropical / Moderate',
    minHst: 20,
    maxHst: 30,
    cycle: 30,
    harvestType: 'sekali_panen',
    soil: '55-70%',
    temp: '20-28°C',
    minSoil: 55,
    maxSoil: 70,
    criticalDry: 40,
    overwaterAlert: 85,
    minTemp: 20,
    maxTemp: 28,
    maxTolerance: 30,
    minHum: 55,
    maxHum: 80,
    substrateMix: 'Cocopeat + sekam bakar/perlite (70:30)',
    substrateMixEn: 'Cocopeat + rice husk charcoal/perlite (70:30)',
    towerPlacement: 'Slot tengah–bawah yang tidak terlalu terik',
    towerPlacementEn: 'Lower–middle slots away from harsh direct heat',
    technicalNote: 'Cocopeat murni terlalu padat bagi akar bayam; disarankan campuran cocopeat + sekam bakar/perlite (70:30).',
    technicalNoteEn: 'Pure cocopeat is too dense for spinach roots; use a 70:30 cocopeat and rice husk charcoal/perlite mix.',
  },
  {
    key: 'basil',
    name: 'Kemangi / Sweet Basil',
    nameEn: 'Sweet Basil',
    scientificName: 'Ocimum basilicum',
    climate: 'Tropis / Hangat',
    climateEn: 'Tropical / Warm',
    minHst: 28,
    maxHst: 35,
    cycle: 35,
    harvestType: 'panen_berkala',
    soil: '50-65%',
    temp: '23-30°C',
    minSoil: 50,
    maxSoil: 65,
    criticalDry: 35,
    overwaterAlert: 85,
    minTemp: 23,
    maxTemp: 30,
    maxTolerance: 32,
    minHum: 55,
    maxHum: 75,
    substrateMix: 'Cocopeat + perlite/sekam bakar (65:35) agar drainase cepat',
    substrateMixEn: 'Cocopeat + perlite/rice husk charcoal (65:35) for fast drainage',
    towerPlacement: 'Slot atas yang mendapat cahaya matahari optimal',
    towerPlacementEn: 'Upper slots receiving full sunlight exposure',
    technicalNote: 'Rentan busuk akar jika terlalu jenuh; butuh jeda kering lebih panjang antar irigasi.',
    technicalNoteEn: 'Prone to root rot if overly saturated; requires longer dry-back intervals between watering cycles.',
  },
  {
    key: 'selada',
    name: 'Selada',
    nameEn: 'Lettuce',
    scientificName: 'Lactuca sativa',
    climate: 'Sejuk / Indoor',
    climateEn: 'Cool / Indoor',
    minHst: 29,
    maxHst: 35,
    cycle: 35,
    harvestType: 'sekali_panen',
    soil: '55-70%',
    temp: '18-25°C',
    minSoil: 55,
    maxSoil: 70,
    criticalDry: 40,
    overwaterAlert: 85,
    minTemp: 18,
    maxTemp: 25,
    maxTolerance: 28,
    minHum: 60,
    maxHum: 80,
    substrateMix: 'Cocopeat terbilas + perlite (75:25)',
    substrateMixEn: 'Rinsed cocopeat + perlite (75:25)',
    towerPlacement: 'Sisi lebih teduh / semi-indoor agar suhu daun tetap di bawah 28°C',
    towerPlacementEn: 'Shaded / semi-indoor side to keep leaf temperature below 28°C',
    technicalNote: 'Suhu di atas 28°C memicu daun pahit dan bolting (cepat berbunga); cocok ditempatkan di sisi lebih teduh.',
    technicalNoteEn: 'Temperatures above 28°C trigger bitter leaves and early bolting; place on the cooler, shaded side.',
  },
  {
    key: 'mint',
    name: 'Mint',
    nameEn: 'Mint',
    scientificName: 'Mentha spp.',
    climate: 'Sejuk / Sedang',
    climateEn: 'Cool / Moderate',
    minHst: 30,
    maxHst: 40,
    cycle: 40,
    harvestType: 'panen_berkala',
    soil: '60-75%',
    temp: '18-26°C',
    minSoil: 60,
    maxSoil: 75,
    criticalDry: 45,
    overwaterAlert: 85,
    minTemp: 18,
    maxTemp: 26,
    maxTolerance: 28,
    minHum: 60,
    maxHum: 80,
    substrateMix: 'Cocopeat + sekam bakar/perlite (75:25)',
    substrateMixEn: 'Cocopeat + rice husk charcoal/perlite (75:25)',
    towerPlacement: 'Slot terpisah agar rimpang dan akar tidak menembus slot lain',
    towerPlacementEn: 'Isolated slots so vigorous runners and roots do not choke neighboring crops',
    technicalNote: 'Pertumbuhan akar agresif; ideal ditanam di slot terpisah agar tidak mencekik akar tanaman lain.',
    technicalNoteEn: 'Aggressive root growth; best grown in isolated slots so it does not choke adjacent plants.',
  },
  {
    key: 'seledri',
    name: 'Seledri',
    nameEn: 'Celery',
    scientificName: 'Apium graveolens',
    climate: 'Sejuk / Indoor',
    climateEn: 'Cool / Indoor',
    minHst: 50,
    maxHst: 60,
    cycle: 60,
    harvestType: 'sekali_panen',
    soil: '60-75%',
    temp: '16-24°C',
    minSoil: 60,
    maxSoil: 75,
    criticalDry: 45,
    overwaterAlert: 85,
    minTemp: 16,
    maxTemp: 24,
    maxTolerance: 28,
    minHum: 65,
    maxHum: 85,
    substrateMix: 'Cocopeat terbilas halus + perlite (80:20) untuk retensi air merata',
    substrateMixEn: 'Fine rinsed cocopeat + perlite (80:20) for even water retention',
    towerPlacement: 'Sisi teduh / indoor sejuk; hindari paparan panas langsung > 28°C',
    towerPlacementEn: 'Cool shaded / indoor side; avoid direct heat above 28°C',
    technicalNote: 'Akar sangat dangkal dan cepat layu jika cocopeat kering; pertumbuhan melambat di suhu di atas 28°C.',
    technicalNoteEn: 'Very shallow roots wilt quickly if cocopeat dries out; growth slows down above 28°C.',
  },
  {
    key: 'stroberi',
    name: 'Stroberi',
    nameEn: 'Strawberry',
    scientificName: 'Fragaria x ananassa',
    climate: 'Sejuk / Terkontrol',
    climateEn: 'Cool / Controlled',
    minHst: 65,
    maxHst: 75,
    cycle: 75,
    harvestType: 'panen_berkala',
    soil: '55-70%',
    temp: '18-24°C',
    minSoil: 55,
    maxSoil: 70,
    criticalDry: 40,
    overwaterAlert: 85,
    minTemp: 18,
    maxTemp: 24,
    maxTolerance: 27,
    minHum: 60,
    maxHum: 75,
    substrateMix: 'Cocopeat + perlite/sekam bakar (70:30) untuk aerasi akar prima',
    substrateMixEn: 'Cocopeat + perlite/rice husk charcoal (70:30) for high root aeration',
    towerPlacement: 'Slot tengah–atas dengan cahaya cukup dan aliran udara sejuk',
    towerPlacementEn: 'Upper–middle slots with bright light and cool airflow',
    technicalNote: 'Sangat produktif di menara vertikal cocopeat, namun kualitas bunga dan buah turun tajam di suhu di atas 26-28°C.',
    technicalNoteEn: 'Highly productive in vertical cocopeat towers, though flower and fruit quality drops sharply above 26–28°C.',
  },
  {
    key: 'custom',
    name: 'Kustom (AI)',
    nameEn: 'Custom (AI)',
    scientificName: '',
    climate: 'Sesuai Konteks',
    climateEn: 'Context Adaptive',
    minHst: 30,
    maxHst: 45,
    cycle: 35,
    harvestType: 'sekali_panen',
    soil: '55-75%',
    temp: '20-28°C',
    minSoil: 55,
    maxSoil: 75,
    criticalDry: 40,
    overwaterAlert: 85,
    minTemp: 20,
    maxTemp: 28,
    maxTolerance: 30,
    minHum: 60,
    maxHum: 80,
    substrateMix: 'Cocopeat terbilas + sekam bakar/perlite (70:30)',
    substrateMixEn: 'Rinsed cocopeat + rice husk charcoal/perlite (70:30)',
    towerPlacement: 'Menyesuaikan analisis kelayakan vertikal AI',
    towerPlacementEn: 'Adapted based on AI vertical feasibility analysis',
    technicalNote: 'Masukkan nama tanaman agar Agronomist AI mengevaluasi kelayakan vertikal cocopeat dan batas histeresis pompa.',
    technicalNoteEn: 'Enter a crop name so the AI Agronomist can evaluate vertical cocopeat feasibility and pump hysteresis thresholds.',
  },
];

export function findCropPreset(nameOrKey) {
  const needle = String(nameOrKey || '').trim().toLowerCase();
  if (!needle) return null;
  return SMART_CROPS.find((c) => {
    if (c.key === 'custom') return false;
    const overrides = CROP_TEXT_OVERRIDES[c.key] || {};
    const localizedNames = Object.values(overrides)
      .map((entry) => entry?.name?.toLowerCase())
      .filter(Boolean);
    return (
      c.key === needle ||
      c.name.toLowerCase() === needle ||
      c.nameEn.toLowerCase() === needle ||
      c.scientificName.toLowerCase() === needle ||
      localizedNames.includes(needle) ||
      needle.includes(c.key)
    );
  }) || null;
}

export function clampCocopeatMoisture(minRaw, maxRaw, criticalRaw) {
  const safeMax = Math.min(80, Math.max(55, Math.round(Number(maxRaw) || 75)));
  const safeMin = Math.max(50, Math.min(safeMax - 5, Math.round(Number(minRaw) || 60)));
  const maxCritical = Math.min(45, safeMin - 10);
  const parsedCritical = Number(criticalRaw);
  const safeCritical = Number.isFinite(parsedCritical)
    ? Math.max(35, Math.min(maxCritical, Math.round(parsedCritical)))
    : Math.max(35, maxCritical);

  return {
    idealMin: safeMin,
    idealMax: safeMax,
    pumpOnThreshold: safeMin,
    pumpOffThreshold: safeMax,
    criticalDryAlert: safeCritical,
    overwaterAlert: 85,
  };
}

export function getCropThresholds(cropProfile) {
  if (cropProfile?.pumpOnThreshold != null && cropProfile?.pumpOffThreshold != null) {
    const m = clampCocopeatMoisture(
      cropProfile.pumpOnThreshold,
      cropProfile.pumpOffThreshold,
      cropProfile.criticalDryAlert
    );
    const minTemp = Number.isFinite(Number(cropProfile.tempIdealMin))
      ? Number(cropProfile.tempIdealMin)
      : Math.max(10, (Number(cropProfile.optimalTemp) || 25) - 4);
    const maxTemp = Number.isFinite(Number(cropProfile.tempIdealMax))
      ? Number(cropProfile.tempIdealMax)
      : Math.min(40, (Number(cropProfile.optimalTemp) || 25) + 4);

    return {
      minSoil: m.idealMin,
      maxSoil: m.idealMax,
      pumpOn: m.pumpOnThreshold,
      pumpOff: m.pumpOffThreshold,
      criticalDry: m.criticalDryAlert,
      overwaterAlert: m.overwaterAlert,
      minTemp,
      maxTemp,
      maxTolerance: Number(cropProfile.tempMaxTolerance) || Math.min(35, maxTemp + 2),
      minHum: 60,
      maxHum: 85,
    };
  }

  if (cropProfile?.useCustomThresholds) {
    const optM = Number(cropProfile.optimalMoisture ?? 68);
    const m = clampCocopeatMoisture(optM - 8, optM + 7);
    const optT = Number(cropProfile.optimalTemp ?? 25);
    const optH = Number(cropProfile.optimalHumidity ?? 75);
    return {
      minSoil: m.idealMin,
      maxSoil: m.idealMax,
      pumpOn: m.pumpOnThreshold,
      pumpOff: m.pumpOffThreshold,
      criticalDry: m.criticalDryAlert,
      overwaterAlert: m.overwaterAlert,
      minTemp: Math.max(10, optT - 4),
      maxTemp: Math.min(38, optT + 4),
      maxTolerance: Math.min(40, optT + 6),
      minHum: Math.max(40, optH - 10),
      maxHum: Math.min(95, optH + 10),
    };
  }

  const preset = findCropPreset(cropProfile?.cropName) || SMART_CROPS[0];
  return {
    minSoil: preset.minSoil,
    maxSoil: preset.maxSoil,
    pumpOn: preset.minSoil,
    pumpOff: preset.maxSoil,
    criticalDry: preset.criticalDry,
    overwaterAlert: preset.overwaterAlert,
    minTemp: preset.minTemp,
    maxTemp: preset.maxTemp,
    maxTolerance: preset.maxTolerance,
    minHum: preset.minHum,
    maxHum: preset.maxHum,
  };
}

export function computeHealthScore({ soilMoisture, humidity, temperature, lightLevel, thresholds }) {
  const { minSoil = 65, maxSoil = 80, minTemp = 25, maxTemp = 30, minHum = 65, maxHum = 85 } =
    thresholds || {};

  const rangeScore = (val, lo, hi, warnLow, warnHigh) => {
    if (val == null) return null;
    if (val >= lo && val <= hi) return 100;
    if (val < lo) return Math.max(0, 100 - ((lo - val) / (lo - warnLow)) * 100);
    return Math.max(0, 100 - ((val - hi) / (warnHigh - hi)) * 100);
  };

  const scores = [
    { s: rangeScore(soilMoisture, minSoil, maxSoil, Math.max(0, minSoil - 25), Math.min(100, maxSoil + 15)), w: 0.35 },
    { s: rangeScore(humidity, minHum, maxHum, Math.max(0, minHum - 30), Math.min(100, maxHum + 10)), w: 0.25 },
    { s: rangeScore(temperature, minTemp, maxTemp, Math.max(0, minTemp - 10), Math.min(100, maxTemp + 8)), w: 0.25 },
    { s: rangeScore(lightLevel, 40, 80, 0, 100), w: 0.15 },
  ];

  let totalScore = 0;
  let totalWeight = 0;
  for (const { s, w } of scores) {
    if (s != null) {
      totalScore += s * w;
      totalWeight += w;
    }
  }

  return totalWeight === 0 ? null : parseFloat((totalScore / totalWeight).toFixed(0));
}

const WMO_TABLE = [
  { max: 0, key: 'wmo_clear', en: 'Clear Sky', id: 'Cerah' },
  { max: 2, key: 'wmo_partly_cloudy', en: 'Partly Cloudy', id: 'Cerah Berawan' },
  { max: 3, key: 'wmo_cloudy', en: 'Cloudy', id: 'Berawan' },
  { max: 48, key: 'wmo_foggy', en: 'Foggy', id: 'Berkabut' },
  { max: 57, key: 'wmo_drizzle', en: 'Drizzle', id: 'Gerimis' },
  { max: 67, key: 'wmo_rain', en: 'Rain', id: 'Hujan' },
  { max: 77, key: 'wmo_snow', en: 'Snow', id: 'Salju' },
  { max: 82, key: 'wmo_showers', en: 'Rain Showers', id: 'Hujan Deras' },
  { max: 86, key: 'wmo_snow_showers', en: 'Snow Showers', id: 'Hujan Salju' },
  { max: 999, key: 'wmo_thunderstorm', en: 'Thunderstorm', id: 'Badai Petir' },
];

export function getWmoInfo(code, lang = 'en') {
  const num = Number(code);
  const entry = WMO_TABLE.find((row) => num <= row.max) || WMO_TABLE[WMO_TABLE.length - 1];
  return {
    descKey: entry.key,
    desc: translateKey(lang, entry.key, entry.en),
    emoji: '',
  };
}

export function getLocalizedCropText(crop, lang = 'en') {
  if (!crop) return {};
  const override = CROP_TEXT_OVERRIDES[crop.key]?.[lang];
  if (override) {
    return {
      name: override.name || crop.name,
      climate: override.climate || crop.climate,
      substrateMix: override.substrateMix || crop.substrateMix,
      towerPlacement: override.towerPlacement || crop.towerPlacement,
      technicalNote: override.technicalNote || crop.technicalNote,
    };
  }
  const isId = lang === 'id';
  return {
    name: isId ? crop.name : (crop.nameEn || crop.name),
    climate: isId ? crop.climate : (crop.climateEn || crop.climate),
    substrateMix: isId ? crop.substrateMix : (crop.substrateMixEn || crop.substrateMix),
    towerPlacement: isId ? crop.towerPlacement : (crop.towerPlacementEn || crop.towerPlacement),
    technicalNote: isId ? crop.technicalNote : (crop.technicalNoteEn || crop.technicalNote),
  };
}

export function convertOwmToWmo(code) {
  if (code >= 200 && code < 300) return 95;
  if (code >= 300 && code < 400) return 51;
  if (code >= 500 && code < 600) return 61;
  if (code >= 600 && code < 700) return 71;
  if (code >= 700 && code < 800) return 45;
  if (code === 800) return 0;
  if (code === 801 || code === 802) return 1;
  if (code === 803 || code === 804) return 3;
  return 0;
}

const RELATIVE_TIME_LABELS = {
  en: { now: 'Just now', min: (n) => `${n} m ago`, hr: (n) => `${n} h ago`, day: (n) => `${n} d ago` },
  id: { now: 'Baru saja', min: (n) => `${n} menit lalu`, hr: (n) => `${n} jam lalu`, day: (n) => `${n} hari lalu` },
  zh: { now: '刚刚', min: (n) => `${n} 分钟前`, hr: (n) => `${n} 小时前`, day: (n) => `${n} 天前` },
  jv: { now: 'Nembe wae', min: (n) => `${n} menit kepungkur`, hr: (n) => `${n} jam kepungkur`, day: (n) => `${n} dina kepungkur` },
  ban: { now: 'Wawu mangkin', min: (n) => `${n} menit sane lintang`, hr: (n) => `${n} jam sane lintang`, day: (n) => `${n} rahina sane lintang` },
};

export function formatRelativeTime(timestamp, lang) {
  if (!timestamp) return '';
  const labels = RELATIVE_TIME_LABELS[lang] || RELATIVE_TIME_LABELS.en;
  const mins = Math.floor((Date.now() - timestamp) / 60_000);
  if (mins < 1) return labels.now;
  if (mins < 60) return labels.min(mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return labels.hr(hrs);
  const days = Math.floor(hrs / 24);
  return labels.day(days);
}
