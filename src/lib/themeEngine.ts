export interface ThemeDefinition {
  id: string;
  name: string;
  icon: string;
  greeting: string;
  description: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  colors: {
    bg: string;
    card: string;
    panel: string;
    border: string;
    gold600: string;
    goldRgb: string;
    glow: string;
    accent: string;
  };
}

export const THEMES: Record<string, ThemeDefinition> = {
  LUXURY_COFFEE: {
    id: 'LUXURY_COFFEE',
    name: 'ثيم الكافيه الفاخر',
    icon: '☕',
    greeting: 'أهلاً بكم في كافيه الديب الفاخر • قهوة أصيلة وضيافة ملكية 👑',
    description: 'تصميم ملكي فاخر بألوان القهوة الداكنة، تأثيرات زجاجية، وبخار دافئ متصاعد من الأكواب مع إضاءة ذهبية راقية.',
    badgeBg: 'bg-amber-950/40',
    badgeBorder: 'border-amber-500/30',
    badgeText: 'text-amber-400',
    colors: {
      bg: '#080503',
      card: '#120d08',
      panel: '#1b130c',
      border: 'rgba(212, 175, 55, 0.2)',
      gold600: '#d4af37',
      goldRgb: '212, 175, 55',
      glow: 'rgba(212, 175, 55, 0.25)',
      accent: '#f59e0b',
    },
  },
  RAMADAN: {
    id: 'RAMADAN',
    name: 'ثيم شهر رمضان المبارك',
    icon: '🌙',
    greeting: 'شهر رمضان مبارك • أعاده الله عليكم بالخير واليمن والبركات 🏮',
    description: 'فانوس رمضان متحرك بجانب الشعار، هلال ونجوم تتلألأ ببطء، إضاءة ذهبية خفيفة على البطاقات، وتوهج زاهي للأزرار.',
    badgeBg: 'bg-emerald-950/40',
    badgeBorder: 'border-emerald-500/30',
    badgeText: 'text-emerald-400',
    colors: {
      bg: '#02120a',
      card: '#082214',
      panel: '#103320',
      border: 'rgba(34, 197, 94, 0.22)',
      gold600: '#22c55e',
      goldRgb: '34, 197, 94',
      glow: 'rgba(34, 197, 94, 0.25)',
      accent: '#4ade80',
    },
  },
  EID: {
    id: 'EID',
    name: 'ثيم الأعياد والمناسبات السعيدة',
    icon: '🎉',
    greeting: 'تقبل الله طاعتكم • كل عام وأنتم بخير وعيد سعيد 🎈',
    description: 'بالونات احتفالية متحركة، كونفيتي متساقط ببطء، ألوان ملوكية أرجوانية مع لمعان ذهبي مبهر على الأزرار والكروت.',
    badgeBg: 'bg-purple-950/40',
    badgeBorder: 'border-purple-500/30',
    badgeText: 'text-purple-300',
    colors: {
      bg: '#090314',
      card: '#15082b',
      panel: '#220e42',
      border: 'rgba(168, 85, 247, 0.22)',
      gold600: '#a855f7',
      goldRgb: '168, 85, 247',
      glow: 'rgba(168, 85, 247, 0.28)',
      accent: '#c084fc',
    },
  },
  WINTER: {
    id: 'WINTER',
    name: 'ثيم الشتاء والجو الدافئ',
    icon: '❄️',
    greeting: 'أجواء شتوية دافئة • استمتع بأجود المشروبات الساخنة ☕',
    description: 'تساقط ثلوج انسيابي، بخار متحرك متصاعد بكثافة من الأكواب، مع ألوان شتوية دافئة وتأثير زجاج بارد على الكروت.',
    badgeBg: 'bg-sky-950/40',
    badgeBorder: 'border-sky-500/30',
    badgeText: 'text-sky-300',
    colors: {
      bg: '#030a14',
      card: '#0a1626',
      panel: '#112238',
      border: 'rgba(56, 189, 248, 0.22)',
      gold600: '#38bdf8',
      goldRgb: '56, 189, 248',
      glow: 'rgba(56, 189, 248, 0.25)',
      accent: '#7dd3fc',
    },
  },
  SUMMER: {
    id: 'SUMMER',
    name: 'ثيم الصيف والانتعاش',
    icon: '☀️',
    greeting: 'انتعاش الصيف • عصائر طازجة ومشروبات مثلجة رائعة 🍹',
    description: 'أشعة شمس خفيفة متلألئة، فقاعات منعشة صاعدة، وألوان فيروزية مشمسة مخصصة للعصائر والمشروبات الباردة.',
    badgeBg: 'bg-teal-950/40',
    badgeBorder: 'border-teal-500/30',
    badgeText: 'text-teal-300',
    colors: {
      bg: '#021417',
      card: '#062428',
      panel: '#0e383e',
      border: 'rgba(20, 184, 166, 0.22)',
      gold600: '#14b8a6',
      goldRgb: '20, 184, 166',
      glow: 'rgba(20, 184, 166, 0.25)',
      accent: '#2dd4bf',
    },
  },
  VALENTINE: {
    id: 'VALENTINE',
    name: 'ثيم عيد الحب والرومانسية',
    icon: '❤️',
    greeting: 'أيامكم مليئة بالحب والسعادة • قهوتنا صُنعت بحب ☕❤️',
    description: 'قلوب صغيرة متحركة تصعد ببطء، هالة نبض وردية دافئة حول الشعار، وألوان ملوكية مخملية تفيض بالأناقة.',
    badgeBg: 'bg-rose-950/40',
    badgeBorder: 'border-rose-500/30',
    badgeText: 'text-rose-400',
    colors: {
      bg: '#120206',
      card: '#24060f',
      panel: '#360a17',
      border: 'rgba(244, 63, 94, 0.22)',
      gold600: '#f43f5e',
      goldRgb: '244, 63, 94',
      glow: 'rgba(244, 63, 94, 0.28)',
      accent: '#fb7185',
    },
  },
  NEW_YEAR: {
    id: 'NEW_YEAR',
    name: 'ثيم رأس السنة والألعاب النارية',
    icon: '🎆',
    greeting: 'سنة جديدة سعيدة 2026 • نتمناها سنة خير ونجاح للجميع 🥳',
    description: 'ألعاب نارية ناعمة متلألئة أعلى الشاشة، نجوم تضيء وتختفي ببطء، ومؤثرات احتفالية زرقاء وذهبية خلابة.',
    badgeBg: 'bg-cyan-950/40',
    badgeBorder: 'border-cyan-500/30',
    badgeText: 'text-cyan-300',
    colors: {
      bg: '#020617',
      card: '#0f172a',
      panel: '#1e293b',
      border: 'rgba(14, 165, 233, 0.22)',
      gold600: '#0ea5e9',
      goldRgb: '14, 165, 233',
      glow: 'rgba(14, 165, 233, 0.28)',
      accent: '#38bdf8',
    },
  },
};

export function normalizeThemeKey(theme?: string): string {
  if (!theme || theme === 'NONE') return 'LUXURY_COFFEE';
  if (theme === 'EID_AL_FITR' || theme === 'EID_AL_ADHA') return 'EID';
  if (THEMES[theme]) return theme;
  return 'LUXURY_COFFEE';
}

export function applyThemeToDOM(themeKey?: string) {
  const root = document.documentElement;
  const normalizedKey = normalizeThemeKey(themeKey);
  const theme = THEMES[normalizedKey] || THEMES.LUXURY_COFFEE;

  root.style.setProperty('--luxury-bg', theme.colors.bg);
  root.style.setProperty('--luxury-card', theme.colors.card);
  root.style.setProperty('--luxury-panel', theme.colors.panel);
  root.style.setProperty('--luxury-border', theme.colors.border);
  root.style.setProperty('--gold-600', theme.colors.gold600);
  root.style.setProperty('--gold-500', theme.colors.gold600);
  root.style.setProperty('--gold-400', theme.colors.accent);
  root.style.setProperty('--gold-rgb', theme.colors.goldRgb);
  root.style.setProperty('--theme-glow', theme.colors.glow);
  root.style.setProperty('--theme-accent', theme.colors.accent);

  // Set attribute on html element for easy CSS targeting
  root.setAttribute('data-theme', normalizedKey);
}
