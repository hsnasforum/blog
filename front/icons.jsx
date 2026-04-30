// Lightweight inline SVG icons. All 20×20, stroke-based, currentColor.
const Ic = ({ children, size = 18, stroke = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
    stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">
    {children}
  </svg>
);

const IconHome = (p) => <Ic {...p}><path d="M3 9.5 10 3l7 6.5V16a1 1 0 0 1-1 1h-3v-5h-6v5H4a1 1 0 0 1-1-1V9.5Z"/></Ic>;
const IconSparkle = (p) => <Ic {...p}><path d="M10 3v3M10 14v3M3 10h3M14 10h3M5.5 5.5l2 2M12.5 12.5l2 2M14.5 5.5l-2 2M7.5 12.5l-2 2"/></Ic>;
const IconRadar = (p) => <Ic {...p}><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3.5"/><path d="M10 10 16 6"/></Ic>;
const IconWorkflow = (p) => <Ic {...p}><rect x="2.5" y="3" width="6" height="4" rx="1.2"/><rect x="11.5" y="13" width="6" height="4" rx="1.2"/><path d="M5.5 7v3.5a2 2 0 0 0 2 2h7"/></Ic>;
const IconSettings = (p) => <Ic {...p}><circle cx="10" cy="10" r="2.4"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.4 4.4l1.4 1.4M14.2 14.2l1.4 1.4M15.6 4.4l-1.4 1.4M5.8 14.2l-1.4 1.4"/></Ic>;
const IconUser = (p) => <Ic {...p}><circle cx="10" cy="7" r="3"/><path d="M3.5 17c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/></Ic>;
const IconBolt = (p) => <Ic {...p}><path d="M11 2 4 11h5l-1 7 7-9h-5l1-7Z"/></Ic>;
const IconPlus = (p) => <Ic {...p}><path d="M10 4v12M4 10h12"/></Ic>;
const IconArrowRight = (p) => <Ic {...p}><path d="M4 10h12M11 5l5 5-5 5"/></Ic>;
const IconArrowUpRight = (p) => <Ic {...p}><path d="M6 14 14 6M7 6h7v7"/></Ic>;
const IconCheck = (p) => <Ic {...p}><path d="m4 10 4 4 8-8"/></Ic>;
const IconX = (p) => <Ic {...p}><path d="M5 5l10 10M15 5 5 15"/></Ic>;
const IconChevron = (p) => <Ic {...p}><path d="m6 8 4 4 4-4"/></Ic>;
const IconChevronRight = (p) => <Ic {...p}><path d="m8 6 4 4-4 4"/></Ic>;
const IconSearch = (p) => <Ic {...p}><circle cx="9" cy="9" r="5"/><path d="m13 13 4 4"/></Ic>;
const IconCommand = (p) => <Ic {...p}><path d="M6 4a2 2 0 0 1 2 2v8a2 2 0 1 1-2-2h8a2 2 0 1 1-2 2V6a2 2 0 1 1 2 2H6a2 2 0 1 1 2-2"/></Ic>;
const IconBell = (p) => <Ic {...p}><path d="M5 9a5 5 0 0 1 10 0c0 4 2 5 2 5H3s2-1 2-5ZM8 16a2 2 0 0 0 4 0"/></Ic>;
const IconDoc = (p) => <Ic {...p}><path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M12 3v3h3"/></Ic>;
const IconChart = (p) => <Ic {...p}><path d="M3 17h14"/><path d="M6 17V9M10 17V5M14 17v-6"/></Ic>;
const IconFlame = (p) => <Ic {...p}><path d="M10 17c3 0 5-2 5-5 0-3-3-3-3-7 0 0-3 1-4 5-1-1-2-2-2-4 0 0-3 2-3 6 0 3 2 5 4 5"/></Ic>;
const IconTrend = (p) => <Ic {...p}><path d="M3 14 8 9l3 3 6-6"/><path d="M13 6h4v4"/></Ic>;
const IconCloud = (p) => <Ic {...p}><path d="M6 14a3.5 3.5 0 0 1-.5-7 4.5 4.5 0 0 1 8.7 1A3 3 0 0 1 14 14H6Z"/></Ic>;
const IconLink = (p) => <Ic {...p}><path d="M9 11a3 3 0 0 0 4 0l3-3a3 3 0 0 0-4-4l-1 1"/><path d="M11 9a3 3 0 0 0-4 0l-3 3a3 3 0 0 0 4 4l1-1"/></Ic>;
const IconCopy = (p) => <Ic {...p}><rect x="6" y="6" width="11" height="11" rx="1.5"/><path d="M14 6V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h2"/></Ic>;
const IconDownload = (p) => <Ic {...p}><path d="M10 3v10M5 9l5 5 5-5M4 17h12"/></Ic>;
const IconPalette = (p) => <Ic {...p}><path d="M10 3a7 7 0 1 0 0 14c1 0 1.5-.7 1.5-1.5 0-1.5 1-2 2-2H15a3 3 0 0 0 0-6 7 7 0 0 0-5-4.5Z"/><circle cx="6.5" cy="9" r=".7" fill="currentColor"/><circle cx="9" cy="6" r=".7" fill="currentColor"/><circle cx="13" cy="7" r=".7" fill="currentColor"/></Ic>;
const IconTag = (p) => <Ic {...p}><path d="M3 3h6l8 8-6 6-8-8V3Z"/><circle cx="6.5" cy="6.5" r="1"/></Ic>;
const IconDot = (p) => <Ic {...p}><circle cx="10" cy="10" r="3" fill="currentColor"/></Ic>;
const IconShield = (p) => <Ic {...p}><path d="M10 2.5 3.5 5v5c0 4 3 6.5 6.5 7.5 3.5-1 6.5-3.5 6.5-7.5V5L10 2.5Z"/></Ic>;
const IconAlert = (p) => <Ic {...p}><path d="M10 3 2.5 16h15L10 3Z"/><path d="M10 8.5v3M10 14h.01"/></Ic>;
const IconClock = (p) => <Ic {...p}><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/></Ic>;
const IconEye = (p) => <Ic {...p}><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z"/><circle cx="10" cy="10" r="2.5"/></Ic>;
const IconStar = (p) => <Ic {...p}><path d="m10 3 2.4 4.8 5.3.7-3.8 3.7.9 5.2L10 15l-4.8 2.4.9-5.2L2.3 8.5l5.3-.7L10 3Z"/></Ic>;
const IconRefresh = (p) => <Ic {...p}><path d="M4 10a6 6 0 0 1 10-4M16 10a6 6 0 0 1-10 4"/><path d="M14 3v3h-3M6 17v-3h3"/></Ic>;
const IconLogo = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--accent)" />
        <stop offset="1" stopColor="var(--accent-2)" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="26" height="26" rx="8" fill="url(#lg)" opacity="0.18" />
    <path d="M10 22V10l6 8 6-8v12" fill="none" stroke="url(#lg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="22" cy="10" r="2" fill="url(#lg)" />
  </svg>
);

Object.assign(window, {
  IconHome, IconSparkle, IconRadar, IconWorkflow, IconSettings, IconUser,
  IconBolt, IconPlus, IconArrowRight, IconArrowUpRight, IconCheck, IconX,
  IconChevron, IconChevronRight, IconSearch, IconCommand, IconBell, IconDoc,
  IconChart, IconFlame, IconTrend, IconCloud, IconLink, IconCopy, IconDownload,
  IconPalette, IconTag, IconDot, IconShield, IconAlert, IconClock, IconEye,
  IconStar, IconRefresh, IconLogo,
});
