# ChisinauDex evaluation

Run 2026-09-27T08:16:12.566Z on 2815 documents (corpus 2026-09-27), 20 questions (10 RO, 10 RU: 10 answerable, 5 without an answer, 5 about real contradictions).

| Metric | Value | What it measures |
| --- | --- | --- |
| Correct outcome | 85% | status matches the expectation (answer / refusal / contradiction) |
| Citation accuracy (verbatim) | 100% | 27/27 cited quotes found word for word in their document |
| Citation relevance | 100% | answers citing at least one document of the right institution |
| Correct refusal rate | 100% | unanswerable questions answered with "not found" |
| False refusal rate | 20% | answerable questions wrongly refused (lower is better) |
| Contradiction detection | 100% | questions about a real contradiction that show it |
| False contradictions | 0% | plain questions wrongly flagged (lower is better) |
| Routing accuracy | 93% | responsible institution as expected |
| Answer language | 100% | answer in the language of the question |
| AI mode | 95% | the rest used the no-AI fallback (rate limits, errors) |
| Median latency | 6186 ms | without cache |

## Per question

| id | question | expected | got | mode | quotes (verbatim) | right source | route | ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ro-01 | Cum înscriu copilul la grădiniță? | answer | ✓ ok | fallback | 3 (3) | ✓ | ✓ egradinita | 2422 |
| ro-02 | Cum obțin certificat de urbanism? | answer | ✓ partial | ai | 1 (1) | ✓ | ✓ dgaurf | 847 |
| ro-03 | Care este tariful la apă pentru un metru cub? | answer | ✓ ok | ai | 1 (1) | ✓ | ✓ acc | 708 |
| ro-04 | Până când se depun cererile de înscriere în clasa I? | answer | ✓ ok | ai | 3 (3) | ✓ | ✓ escoala | 1083 |
| ro-05 | Care este programul de lucru al Ghișeului Unic? | answer | ✗ gap | ai | — | — | ✓ chisinau | 1449 |
| ro-06 | Cum înregistrez o firmă nouă la Agenția Servicii Publice? | gap | ✓ gap | ai | — | — | comert | 1050 |
| ro-07 | Ce acte trebuie pentru viza în Marea Britanie? | gap | ✓ gap | ai | — | — | comert | 876 |
| ro-08 | Ce sumă poate primi un startup de la primărie? | conflict | ✓ conflict | ai | 2 (2) | ✓ | ✓ startup | 7380 |
| ro-09 | Cât costă biletul de troleibuz? | conflict | ✓ conflict | ai | 2 (2) | ✓ | ✓ mobilitate | 7063 |
| ro-10 | Care este suma maximă a grantului pentru tineri și migranți? | conflict | ✓ conflict | ai | 2 (2) | ✓ | ✓ startup | 8087 |
| ru-01 | Как записать ребенка в детский сад? | answer | ✓ partial | ai | 1 (1) | ✓ | ✓ egradinita | 15934 |
| ru-02 | Куда обращаться, если сломался лифт? | answer | ✗ gap | ai | — | — | ✓ liftservice | 7776 |
| ru-03 | Как получить сертификат урбанизма? | answer | ✓ partial | ai | 2 (2) | ✓ | ✗ chisinau | 4114 |
| ru-04 | Где можно оплатить счёт за воду? | answer | ✗ gap | ai | — | — | ✓ acc | 8859 |
| ru-05 | Как подать петицию в примэрию? | answer | ✓ ok | ai | 6 (6) | ✓ | ✓ chisinau | 5329 |
| ru-06 | Как оформить пенсию по возрасту? | gap | ✓ gap | ai | — | — | chisinau | 9504 |
| ru-07 | Сколько стоит квартира в Кишинёве? | gap | ✓ gap | ai | — | — | chisinau | 11103 |
| ru-08 | Какие документы нужны для визы в Великобританию? | gap | ✓ gap | ai | — | — | egradinita | 4824 |
| ru-09 | Какой грант можно получить для стартапа? | conflict | ✓ conflict | ai | 2 (2) | ✓ | ✓ startup | 6186 |
| ru-10 | Сколько стоит билет на троллейбус? | conflict | ✓ conflict | ai | 2 (2) | ✓ | ✓ mobilitate | 21600 |
