# Rapport Télémétrique Little Turismo - v4

- **Date** : 17.11.2026 08:53:02
- **Durée d'exécution** : 6.4 s
- **Simulations exécutées** : 14
- **Comparé à** : `v3`

---

## 1. Tableau des Chronos et Fautes

| Circuit | Voiture | Mode | Expert | Difficile | Normal | Facile | Fautes Hors-Piste (Exp/Diff/Norm/Fac) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Serra Nova** | Sentinelle | `qualif` | 70.87s | 73.4s | 76.78s | 80.68s | 0 / 0 / 0 / 0 |
| **Serra Nova** | Tempête | `qualif` | 111s | 102.87s | 108.12s | 114.82s | 640 / 0 / 0 / 0 |
| **Serra Nova** | Sentinelle | `race` | 70.87s | 73.4s | 76.78s | 80.75s | 0 / 0 / 0 / 0 |
| **Serra Nova** | Tempête | `race` | 114.93s | 102.87s | 108.02s | 116.55s | 486 / 0 / 0 / 0 |
| **Valmont** | Tempête | `qualif` | 160.42s | 168.4s | 174.4s | 183.32s | 183 / 398 / 183 / 0 |
| **Valmont** | Sentinelle | `qualif` | 111.47s | 115.55s | 121.43s | 127.78s | 0 / 0 / 0 / 0 |
| **Valmont** | Tempête | `race` | 160.65s | 168.17s | 172.97s | 183.25s | 83 / 416 / 20 / 0 |
| **Valmont** | Sentinelle | `race` | 111.48s | 115.52s | 121.5s | 127.75s | 0 / 0 / 0 / 0 |
| **Sous-Bois** | Tempête | `qualif` | 121.58s | 112.08s | 115.05s | 121.23s | 772 / 702 / 0 / 0 |
| **Sous-Bois** | Sentinelle | `qualif` | 73.18s | 76.85s | 81.05s | 85.88s | 0 / 0 / 0 / 0 |
| **Sous-Bois** | Tempête | `race` | 126.42s | 121.77s | 120.37s | 122.33s | 853 / 547 / 0 / 0 |
| **Sous-Bois** | Sentinelle | `race` | 73.18s | 76.85s | 81.07s | 85.9s | 0 / 0 / 0 / 0 |
| **Arène** | Frelon | `qualif` | 47.85s | 49.53s | 51.4s | 53.82s | 0 / 0 / 0 / 0 |
| **Arène** | Frelon | `race` | 47.83s | 49.53s | 51.42s | 53.83s | 0 / 0 / 0 / 0 |

## 2. Détection des Anomalies Critiques

- ⚠️ **Serra Nova (Tempête, qualif)** : L'IA Expert a 640 ticks hors-piste ! (Survirage ou freinage trop tardif).
- ⚠️ **Inversion hiérarchique sur Serra Nova (Tempête, qualif)** : Difficile (102.87s) bat Expert (111s) ! L'Expert commet probablement une grosse erreur.
- ⚠️ **Serra Nova (Tempête, race)** : L'IA Expert a 486 ticks hors-piste ! (Survirage ou freinage trop tardif).
- ⚠️ **Inversion hiérarchique sur Serra Nova (Tempête, race)** : Difficile (102.87s) bat Expert (114.93s) ! L'Expert commet probablement une grosse erreur.
- ⚠️ **Valmont (Tempête, qualif)** : L'IA Expert a 183 ticks hors-piste ! (Survirage ou freinage trop tardif).
- ⚠️ **Sous-Bois (Tempête, qualif)** : L'IA Expert a 772 ticks hors-piste ! (Survirage ou freinage trop tardif).
- ⚠️ **Inversion hiérarchique sur Sous-Bois (Tempête, qualif)** : Difficile (112.08s) bat Expert (121.58s) ! L'Expert commet probablement une grosse erreur.
- ⚠️ **Sous-Bois (Tempête, race)** : L'IA Expert a 853 ticks hors-piste ! (Survirage ou freinage trop tardif).
- ⚠️ **Inversion hiérarchique sur Sous-Bois (Tempête, race)** : Difficile (121.77s) bat Expert (126.42s) ! L'Expert commet probablement une grosse erreur.

## 3. Comparaison avec v3

| Circuit | Voiture | Mode | Delta Chrono Expert | Delta Fautes Expert |
| :--- | :--- | :--- | :---: | :---: |
| **Serra Nova** | Sentinelle | `qualif` | 🟢 -6.13s (gain) | ⚪ = |
| **Serra Nova** | Tempête | `qualif` | 🔴 +5.18s | 🔴 +423 fautes |
| **Serra Nova** | Sentinelle | `race` | 🟢 -6.13s (gain) | ⚪ = |
| **Serra Nova** | Tempête | `race` | 🔴 +9.10s | 🔴 +271 fautes |
| **Valmont** | Tempête | `qualif` | 🔴 +5.32s | 🔴 +183 fautes |
| **Valmont** | Sentinelle | `qualif` | 🟢 -4.08s (gain) | ⚪ = |
| **Valmont** | Tempête | `race` | 🔴 +5.30s | 🔴 +83 fautes |
| **Valmont** | Sentinelle | `race` | 🟢 -4.17s (gain) | ⚪ = |
| **Sous-Bois** | Tempête | `qualif` | 🔴 +14.63s | 🔴 +772 fautes |
| **Sous-Bois** | Sentinelle | `qualif` | 🟢 -6.34s (gain) | ⚪ = |
| **Sous-Bois** | Tempête | `race` | 🔴 +19.50s | 🔴 +853 fautes |
| **Sous-Bois** | Sentinelle | `race` | 🟢 -6.40s (gain) | ⚪ = |
| **Arène** | Frelon | `qualif` | 🟢 -7.20s (gain) | ⚪ = |
| **Arène** | Frelon | `race` | 🟢 -8.05s (gain) | ⚪ = |
