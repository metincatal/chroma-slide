export interface ThemeConfig {
  id: string;
  name: string;
  folder: string;
  // Texture yuklenemezse kullanilacak fallback renkler
  boardColor: string;
  pathColor: string;
  bgColor: string;
  // Tema karti icin onizleme renkleri
  previewBoard: string;
  previewPath: string;
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'ice',
    name: 'Buzul Vadisi',
    folder: 'ice',
    boardColor: '#3a3d4a',
    pathColor: '#e8eef4',
    bgColor: '#f0ece6',
    previewBoard: '#4a5568',
    previewPath: '#e2e8f0',
  },
  {
    id: 'wood',
    name: 'Meşe Konak',
    folder: 'wood',
    boardColor: '#5c3a1e',
    pathColor: '#f0e6d8',
    bgColor: '#f0ece6',
    previewBoard: '#6b4226',
    previewPath: '#f5efe6',
  },
  {
    id: 'marble',
    name: 'Mermer Saray',
    folder: 'marble',
    boardColor: '#2a2a2e',
    pathColor: '#f2ece0',
    bgColor: '#f0ece6',
    previewBoard: '#363638',
    previewPath: '#f5efe6',
  },
  {
    id: 'paper',
    name: 'Kağıt Atölye',
    folder: 'paper',
    boardColor: '#a0885c',
    pathColor: '#f8f4ee',
    bgColor: '#f0ece6',
    previewBoard: '#b8976a',
    previewPath: '#faf8f4',
  },
  {
    id: 'concrete',
    name: 'Taş Kale',
    folder: 'concrete',
    boardColor: '#4a4a4e',
    pathColor: '#eae6e0',
    bgColor: '#f0ece6',
    previewBoard: '#5a5a5e',
    previewPath: '#eee8e2',
  },
  {
    id: 'fabric',
    name: 'Kadife Rüya',
    folder: 'fabric',
    boardColor: '#2c2420',
    pathColor: '#f0eae4',
    bgColor: '#f0ece6',
    previewBoard: '#3a302a',
    previewPath: '#f4ede6',
  },
];

export function getThemeById(id: string): ThemeConfig {
  return THEMES.find(t => t.id === id) || THEMES[0];
}
