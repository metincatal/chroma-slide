# Proje: Chroma Maze - Hibrit Casual Bulmaca Oyunu
# Vizyon ve Teknik Uygulama Belgesi

## 1. OYUN TANIMI VE VİZYON
Bu oyun, klasik "Roller Splat!" (kaydır-boya) mekaniğini temel alan ancak üzerine stratejik derinlik katan bir **Hibrit-Casual** bulmaca oyunudur.
**Temel Amaç:** Oyuncu bir topu yöneterek labirentteki tüm "yürünebilir" alanları boyamalıdır. Ancak bunu yaparken renkleri karıştırmalı, doğru sırayı takip etmeli ve peşindeki "Silici" düşmanlardan kaçmalıdır.

## 2. OYUN MEKANİKLERİ VE KURALLAR (FEATURE SPECS)

### 2.1. Temel Hareket (Slide Movement)
*   **Fizik Yok, Matematik Var:** Oyun Unity fiziği kullanmaz. Hareket "Grid tabanlıdır".
*   **Kural:** Oyuncu bir yöne (Sağ/Sol/Yukarı/Aşağı) kaydırdığında, top o yöndeki **ilk duvara kadar** durmadan gider. Yarı yolda durmak yoktur.
*   **Boyama:** Topun geçtiği her kare (Tile), topun rengine boyanır.

### 2.2. Kromatik Mantık (Renk Karışımı)
Renkler **Bitmask (Binary)** olarak tutulur.
*   **Değerler:** Kırmızı=1 (001), Mavi=2 (010), Sarı=4 (100).
*   **Kova (Bucket) Mekaniği:** Oyuncu bir boya kovasından geçerse, rengi değişmez, **karışır**.
    *   *Formül:* `YeniRenk = MevcutRenk | KovaRengi` (Bitwise OR).
    *   *Örnek:* Mavi Top (2) + Sarı Kova (4) = Yeşil Top (6).
*   **Kilitli Kapılar (Gates):** Belirli kareler kapı ile kapalıdır.
    *   *Kural:* Kapı "Yeşil" (6) ise, oyuncunun içinde hem Mavi (2) hem Sarı (4) bitleri olmalıdır.
    *   *Kontrol:* `(OyuncuRengi & KapıRengi) == KapıRengi`.

### 2.3. Dinamik Topografya
*   **Tek Yönlü Rampalar:** Sadece okun gösterdiği yönden girilebilir. Tersten veya yanlardan gelirse duvar muamelesi görür.
*   **Portallar:** Giriş portalına giren top, hareket yönünü ve hızını koruyarak Çıkış portalından anında çıkar.
*   **Sokoban Blokları:** İtilebilen kutular. Oyuncu boyama yaparken bu kutuları iterek stratejik "durma noktaları" (stopper) yaratır.

### 2.4. "Silici" Düşmanlar (Eraser AI)
*   **Davranış:** Haritada gezen düşman küreleri.
*   **Etki:** Düşmanın geçtiği karelerin boyası **silinir** (State: Painted -> Empty). Oyuncu o alanı tekrar boyamak zorundadır.
*   **Yapay Zeka:** Rastgele gezmezler. A* (A-Star) algoritması kullanırlar ancak "Ağırlıklı"dır:
    *   *Maliyet:* Boyalı karede yürümek ucuzdur, boş karede yürümek pahalıdır. Bu yüzden düşman inatla oyuncunun boyadığı yolu takip eder.

### 2.5. Oyun Modları
*   **Zen Modu:** Düşman yok, süre yok. Sadece boyama ve ASMR sesleri.
*   **Mücadele Modu:** "En az hamle" ile bitirme hedefi.
*   **Turf War (Bölge Savaşı):** 2 Renk (Kırmızı vs Mavi). Rakibin boyadığı alandan geçerken top yavaşlar (Sürtünme artar). En çok alanı boyayan kazanır.

---

## 3. TEKNİK MİMARİ (TECH STACK)

*   **Motor:** React Native (Expo).
*   **Görsel:** React Three Fiber (R3F) - Performans için `InstancedMesh` kullanılmalı.
*   **State:** Zustand (Transient updates ile 60FPS hedeflenmeli).
*   **Veri Yapısı:** Grid, tek boyutlu `number` dizisi olarak tutulacak. `index = y * width + x`.

---

## 4. ADIM ADIM UYGULAMA PLANI (PHASES)

### AŞAMA 1: İSKELET (Grid & Temel Hareket)
1.  Expo + R3F kurulumu.
2.  `GameStore` (Zustand) kurulumu. Grid verisinin tanımlanması.
3.  Fiziksiz hareket hesaplama algoritması (`calculateTargetPosition`).
4.  Görselleştirme: Duvarlar ve Zemin için InstancedMesh.

### AŞAMA 2: RENK VE ETKİLEŞİM
1.  Grid verisine `color` ve `type` (Kova, Kapı) özelliklerinin eklenmesi.
2.  Bitwise renk karışımı mantığının harekete entegre edilmesi.
3.  ShaderMaterial ile "Sıvı Boya" efekti (Texture manipulation).

### AŞAMA 3: DÜŞMAN VE AI
1.  Düşman entity'sinin oluşturulması.
2.  `Weighted A*` algoritmasının yazılması (Boyalı alanları tercih eden).
3.  Düşman hareketinin `useFrame` ile senkronize edilmesi.

### AŞAMA 4: SEVİYE ÜRETİMİ (PCG)
1.  `LevelGenerator.ts` scripti.
2.  "Reverse Walker" algoritması: Bitişten geriye doğru yürüyerek ve arkasına duvar koyarak bölüm yaratma.
3.  JSON çıktı formatı.

### AŞAMA 5: UI & META
1.  Ana Menü, Mağaza (Skin), Ayarlar.
2.  Haptics (Titreşim) entegrasyonu.