# Rapport Télémétrique Little Turismo - v2

- **Date** : 16.11.2026 22:18:30
- **Durée d'exécution** : 5.4 s
- **Simulations exécutées** : 14
- **Comparé à** : `v1`

---

## 1. Tableau des Chronos et Fautes

| Circuit | Voiture | Mode | Expert | Difficile | Normal | Facile | Fautes Hors-Piste (Exp/Diff/Norm/Fac) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Serra Nova** | Sentinelle | `qualif` | 71.32s | 74s | 76.5s | 80.63s | 0 / 0 / 0 / 0 |
| **Serra Nova** | Tempête | `qualif` | 96.88s | 95s | 92.52s | 97.52s | 532 / 131 / 0 / 0 |
| **Serra Nova** | Sentinelle | `race` | 71.37s | 74s | 76.52s | 80.65s | 0 / 0 / 0 / 0 |
| **Serra Nova** | Tempête | `race` | 97.4s | 97.05s | 92.5s | 97.43s | 419 / 396 / 0 / 0 |
| **Valmont** | Tempête | `qualif` | 136.9s | 141.78s | 147.28s | 155.48s | 0 / 0 / 0 / 0 |
| **Valmont** | Sentinelle | `qualif` | 111.53s | 116s | 120.87s | 127.8s | 0 / 0 / 0 / 0 |
| **Valmont** | Tempête | `race` | 136.92s | 141.8s | 147.35s | 155.5s | 0 / 0 / 0 / 0 |
| **Valmont** | Sentinelle | `race` | 111.47s | 115.98s | 120.9s | 127.78s | 0 / 0 / 0 / 0 |
| **Sous-Bois** | Tempête | `qualif` | 101.15s | 102.93s | 101.93s | 101.68s | 843 / 460 / 499 / 0 |
| **Sous-Bois** | Sentinelle | `qualif` | 76.8s | 79.2s | 80.45s | 85.15s | 0 / 0 / 0 / 0 |
| **Sous-Bois** | Tempête | `race` | 105.83s | 110.08s | 103.67s | 107.32s | 870 / 471 / 411 / 0 |
| **Sous-Bois** | Sentinelle | `race` | 76.78s | 79.2s | 80.42s | 85.05s | 0 / 0 / 0 / 0 |
| **Arène** | Frelon | `qualif` | 51.95s | 52.07s | 51.95s | 53.08s | 0 / 0 / 0 / 0 |
| **Arène** | Frelon | `race` | 52.32s | 52.12s | 53.08s | 52.87s | 0 / 0 / 0 / 0 |

## 2. Détection des Anomalies Critiques

- ⚠️ **Serra Nova (Tempête, qualif)** : L'IA Expert a 532 ticks hors-piste ! (Survirage ou freinage trop tardif).
- ⚠️ **Inversion hiérarchique sur Serra Nova (Tempête, qualif)** : Difficile (95s) bat Expert (96.88s) ! L'Expert commet probablement une grosse erreur.
- ⚠️ **Serra Nova (Tempête, race)** : L'IA Expert a 419 ticks hors-piste ! (Survirage ou freinage trop tardif).
- ⚠️ **Sous-Bois (Tempête, qualif)** : L'IA Expert a 843 ticks hors-piste ! (Survirage ou freinage trop tardif).
- ⚠️ **Sous-Bois (Tempête, race)** : L'IA Expert a 870 ticks hors-piste ! (Survirage ou freinage trop tardif).

## 3. Comparaison avec v1

| Circuit | Voiture | Mode | Delta Chrono Expert | Delta Fautes Expert |
| :--- | :--- | :--- | :---: | :---: |
| **Serra Nova** | Sentinelle | `qualif` | 🔴 +5.22s | ⚪ = |
| **Serra Nova** | Tempête | `qualif` | 🟢 -3.47s (gain) | 🟢 -1086 (moins de fautes) |
| **Serra Nova** | Sentinelle | `race` | 🔴 +5.24s | ⚪ = |
| **Serra Nova** | Tempête | `race` | 🟢 -2.37s (gain) | 🟢 -734 (moins de fautes) |
| **Valmont** | Tempête | `qualif` | 🟢 -5.48s (gain) | 🟢 -776 (moins de fautes) |
| **Valmont** | Sentinelle | `qualif` | 🔴 +4.60s | 🟢 -413 (moins de fautes) |
| **Valmont** | Tempête | `race` | 🟢 -1.16s (gain) | 🟢 -312 (moins de fautes) |
| **Valmont** | Sentinelle | `race` | 🔴 +4.49s | 🟢 -653 (moins de fautes) |
| **Sous-Bois** | Tempête | `qualif` | 🟢 -69.23s (gain) | 🔴 +843 fautes |
| **Sous-Bois** | Sentinelle | `qualif` | 🔴 +7.47s | ⚪ = |
| **Sous-Bois** | Tempête | `race` | 🟢 -64.35s (gain) | 🔴 +870 fautes |
| **Sous-Bois** | Sentinelle | `race` | 🔴 +7.58s | ⚪ = |
| **Arène** | Frelon | `qualif` | 🟢 -4.68s (gain) | ⚪ = |
| **Arène** | Frelon | `race` | 🟢 -6.55s (gain) | ⚪ = |
