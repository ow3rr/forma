# Карта «Forma»

## Что это
Один файл `forma.html` (~677 строк, без сборки): трекер силовых тренировок в тренажёрном зале. Тренер строит 8-недельный цикл, подбирает веса/повторы по результатам, ведёт дневник и статистику. Данные в localStorage (`forma:*`), опционально синхронизируются через `window.claude` (db + user), когда страница открыта в Claude.

## Запуск
Открыть `forma.html` в браузере. Сборки и тестов нет.

## Разделы forma.html (по строкам)
- 4–79 `<style>`; 82 `<nav id="tabs">`; далее `#app`, `#ed` (редактор), `#sheet/#sheetbg`, `#timer`
- 88 утилиты: `esc, pad, dkey, parseK, todayK, addD, diffD, wdi, mondayOf, dateRu, fmt, roundTo, clone, uid, plural`; даты — строки `YYYY-MM-DD`, неделя с понедельника
- 108 библиотека: `EX` (упражнения: `n, grp, comp, inc, time, tags`), `GRP_ALT` (замены по группам), `AREAS` (зоны травм), `TPL` (шаблоны дней для 2/3/4 дней в неделю), `GOALS`, `LEVELS` (темп роста `rate`), `W` (8 недель: `rir`, `dl` — разгрузка)
- 152 состояние: `DEFP, S, LOG, UI, lsGet/lsSet, loadLocal, allSessions, lastSession`
- 167 синхронизация: `Sync, persist, push, pull, flush, initSync`
- 218 движок тренера: `weekOf, cycleDone, isDeload, gCurve, range, restSec, slotsFor, dayDefs, nextDay, planDay, adaptEx, finalizeSession, rampFor, ensureRamp, fatigueFlag, weekMissed`
- 335 `coachCards` — подсказки на «Сегодня»
- 358 отрисовка: `TABS, renderTabs, go, renderAll`, `onboardHtml, profileFields, todayHtml, diaryHtml, planHtml, statsHtml, moreHtml`, графики `lineChart, volumeChart`, `forecast, exHistory`
- 520 редактор тренировки: `newSession, persistDraft, openEditor/closeEditor, renderEditor`, таймер отдыха `TM, startTimer/stopTimer`, шторка `openSheet/closeSheet`
- 566 события: один делегированный `click` по `[data-act]` (switch), далее input/change-обработчики, `toast`
- 671 старт: `loadLocal(); renderAll(); initSync()`; вкладка из `location.hash`

## Структуры данных
- `S` (ключ `state`): `{profile{goal,level,days[],wrist,start,created}, slots, lifts{exId→…}, ramp, deloadUntil, draft, _ts}`
- `LOG` (ключи `log-YYYY-MM`): `{sessions:[{title,date,dayId,ex:[{id,sets:[{done,reps,…}]}],ready,…}], _ts}`
- `UI`: `{tab, open, exSel, editor{s,isNew}, sheet}` — только в памяти
- Прогрессия: `S.lifts` + `range(id,week)` + `adaptEx`; `S.ramp` — плавный возврат после перерыва/травмы (`kind:'injury'` и др.)

## Потоки данных
1. Запись: действие → меняет `S`/`LOG[месяц]` → `saveState()`/`saveLog(mk)` → `persist`: ставит `_ts=Date.now()`, пишет в localStorage, при `Sync.db` через 600 мс `push`.
2. Синхронизация: `initSync` берёт `window.claude.use('db'|'user')`; документы `data/users/{uid}/state` и `…/log-YYYY-MM`. `pull` сравнивает `_ts` (новее побеждает целиком документ), пропускает ключи с активным push; `push` — повтор при ошибке, `invalid_argument` → режим «ro». `flush` на `visibilitychange(hidden)`/`pagehide`, `pull` при возврате на вкладку. Статус — `setSync`/`syncLabel`.
3. Тренер: `todayHtml` → `nextDay` (ротация по последнему `dayId`) → `planDay(def,date,ready)` (неделя цикла `weekOf`, разгрузка `isDeload`, `S.ramp`) → `newSession`.
4. Редактор: `openEditor` → правки подходов (`data-act`) → `persistDraft` сохраняет черновик в `S.draft` (только для новой) → завершение: `finalizeSession` обновляет `S.lifts`, `ramp`, пишет сессию в `LOG`, чистит `draft`.
5. Экран: `renderAll` полностью перерисовывает активную вкладку через `innerHTML`; редактор рисуется поверх.

## Подводные камни
- `pull` заменяет `S` через `Object.assign` с дефолтами — новые поля `S` добавлять и туда, и в инициализацию `S`.
- Конфликты решаются по `_ts` всего документа, слияния по сессиям нет.
- Рендер через строки HTML: пользовательский текст оборачивать в `esc()`.
- Контрольная неделя 8; `cycleDone` — после 56 дней от `profile.start`.
