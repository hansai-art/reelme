# Life Timeline: looking back at your own posts through astrology's life cycles

[繁體中文](astrology.md) · **English** · [Back to the project](../../README.en.md)

> Status: In testing. I have added this feature to the code. I am still testing it with more people’s birth data to make sure it works before I officially release it.

## Contents

- [1. What this is](#1-what-this-is)
- [2. How to use it](#2-how-to-use-it)
  - [2.1 In the web page](#21-in-the-web-page)
  - [2.2 Test anyone’s birth data from the command line](#22-test-anyones-birth-data-from-the-command-line)
- [3. How it is calculated](#3-how-it-is-calculated)
  - [3.1 Where the birth chart comes from](#31-where-the-birth-chart-comes-from)
  - [3.2 Two techniques for calculating life cycles](#32-two-techniques-for-calculating-life-cycles)
  - [3.3 How time windows are defined](#33-how-time-windows-are-defined)
- [4. Interpretation rules](#4-interpretation-rules)
- [5. Comparing posts, and an honest comparison](#5-comparing-posts-and-an-honest-comparison)
  - [5.1 How the comparison works](#51-how-the-comparison-works)
  - [5.2 Why comparison is essential](#52-why-comparison-is-essential)
  - [5.3 My own results](#53-my-own-results)
  - [5.4 What this means](#54-what-this-means)
- [6. Verification and testing](#6-verification-and-testing)
- [7. Limits](#7-limits)
- [8. Privacy](#8-privacy)
- [9. Who did what](#9-who-did-what)
- [10. Reporting problems](#10-reporting-problems)

## 1. What this is

“Life Timeline” is an advanced feature of Reelme, the life cinema 「人生電影院」. It uses two Western astrology techniques for life cycles to lay out important time windows from birth through the next five years. It is not a prediction tool or a judgment about your fate. It is a fixed framework for looking back, with the same rules applied to everyone.

It places each time window near your Facebook posts. You can look back at what you wrote during that period and see how astrological tradition typically describes that cycle.

This feature is in the optional birth chart step of **Parallel life** 「第二人生」. It appears only after you add your own Facebook export.

## 2. How to use it

### 2.1 In the web page

The home page starts with my demo movie. It does not show a birth data form, so you will not find the Life Timeline there. First, add your own Facebook export.

Follow these steps:

1. Click **Submit: add your FB export** 「交件：放入你的 FB 匯出檔」 to load your Facebook export.
2. Click **Parallel life** 「第二人生」.
3. In **1. Birth chart (optional, can be skipped)** 「一、星盤（選填，可以跳過）」, enter your birth date, birth time, and birthplace.
4. If you do not know your birth time, check **I don't know my birth time** 「不知道出生時間」.
5. Choose your birthplace from 42 cities, or choose **Other location (enter coordinates yourself)** 「其他地點（自己填經緯度）」 and enter the latitude, longitude, and fixed UTC offset.
6. Click **Calculate my chart and explain my birth chart** 「排盤，說明我的命格」.
7. Below the birth chart, in the **Life Timeline** 「人生時間軸」 section, click **Build my life timeline** 「排出我的人生時間軸」.

A progress bar appears during calculation. It usually takes 1 to 3 seconds.

Results appear in two places:

- **Parallel life panel**: It first shows a summary, then divides the results into **Already passed** 「已經走過的」 and **The next five years** 「接下來五年」. The latter is marked **What astrological tradition says, not a prediction.** 「占星傳統的說法，不是預測。」 Each time window has a title, date, age, two descriptions from astrological tradition, and up to two of your posts from that period. By default, it shows only major time windows and past time windows that match a post. Click **Show all N time windows** 「顯示全部 N 個時間窗」 to expand all results. **Sources and reliability** 「資料來源與可信度」 below explains the calculation and comparison results.
- **The big screen in the screening room**: It shows a 1920×1080 Life Timeline, with six colored theme bands, a **Now** 「現在」 line, and dots for time windows matched with posts. The screen also shows **N time windows matched (average of M for random periods)** 「N 個時間窗對得上（隨機時間段平均 M 個）」.

When you then click **Start the simulation** 「開始推演」, major time windows after the branching point are added to the AI prompt as **The same sky** 「同一片天空」. The AI tries to place turning points in the fictional life near these time windows and writes a sky-event description of no more than 20 characters in the relevant scenes. It is the same sky, but different choices.

### 2.2 Test anyone’s birth data from the command line

Testers do not need a Facebook export. They can use the command-line tool directly. You need Node.js version 20 or later. First, install the specified version of the astronomy library in the project root:

```bash
npm install --no-save astronomy-engine@2.1.19
```

If you know the birth time and city, run:

```bash
node agentbox/tools/timeline.mjs --date 1990-05-01 --time 08:30 --city 台北
```

City names are written in Chinese as they appear in the page, for example 台北 (Taipei) and 倫敦 (London). `--cities` lists all 42 of them.

If you do not know the birth time, add `--no-time`:

```bash
node agentbox/tools/timeline.mjs --date 1990-05-01 --no-time --city 倫敦
```

You can also enter latitude, longitude, and time zone directly:

```bash
node agentbox/tools/timeline.mjs --date 1975-12-24 --time 23:10 --lat 69.65 --lon 18.96 --tz Europe/Oslo
node agentbox/tools/timeline.mjs --date 1990-05-01 --time 08:30 --lat 25.03 --lon 121.56 --offset +8
```

`--cities` lists the available city names. `--all` also lists non-major time windows, and `--json` outputs a format suitable for programs to read:

```bash
node agentbox/tools/timeline.mjs --cities
node agentbox/tools/timeline.mjs ... --all
node agentbox/tools/timeline.mjs ... --json
```

The tool reads the calculation engine directly from `agentbox/static/index.html`. This means the command-line tool and web page use the same code. The output includes the calculated UTC time, Sun, Moon, ASC, MC, and, for each time window, its first exact date, number of exact passes, age, title, and coverage. You can compare these results with professional astrology software.

## 3. How it is calculated

### 3.1 Where the birth chart comes from

Astronomy Engine 2.1.19 calculates planetary positions. It is open-source software under the MIT license, written by Don Cross. Positions use apparent geocentric ecliptic longitude for the date, in the tropical zodiac.

The chart uses Placidus houses. At latitudes where Placidus cannot be calculated, it switches to Porphyry. Time zones use the browser’s built-in IANA time zone database, including historical daylight saving time in Taiwan and other regions. For custom locations, the tool uses the fixed UTC offset you enter.

If you do not know your birth time, the chart is calculated for local noon. It does not calculate the Ascendant (ASC), Midheaven (MC), or houses. The Moon’s position may be off by up to about 6 to 7 degrees.

I compared the results with Swiss Ephemeris, an ephemeris commonly used by professional astrology software. I used pyswisseph 2.10.03 and the `sepl_18` and `semo_18` files. I compared 66 birth charts and all ten planets. The largest difference was 0.3 arcminutes for Neptune. The difference was 0.02′ for the Sun and 0.06′ for the Moon. The difference for ASC and MC was less than 0.01 arcminutes. One arcminute is 1/60 of a degree.

### 3.2 Two techniques for calculating life cycles

This feature uses two timing techniques from Western astrology. Every rule is fixed in advance, not selected after looking at your data.

| Technique | Planet or point | Aspect and object |
|---|---|---|
| Transit | Jupiter | Return; conjunction with natal Sun, ASC, and MC |
| Transit | Saturn | Return; square and opposition to natal Saturn; conjunction, square, and opposition to natal Sun, Moon, ASC, and MC |
| Transit | Uranus | Square and opposition to natal Uranus; conjunction, square, and opposition to natal Sun, Moon, ASC, and MC |
| Transit | Neptune | Square to natal Neptune; conjunction, square, and opposition to natal Sun, Moon, ASC, and MC |
| Transit | Pluto | Square to natal Pluto; conjunction, square, and opposition to natal Sun, Moon, ASC, and MC |
| Secondary progression | Progressed Sun | Progressed Sun changes sign |
| Secondary progression | Progressed Moon | Conjunction with natal ASC, IC, DSC, and MC; progressed Moon return |
| Secondary progression | Progressed Sun and Moon | Progressed New Moon, when the progressed Sun and progressed Moon meet |

Transits compare the positions of slow-moving planets in the actual sky with the positions in the birth chart. Secondary progression uses the conversion “one day after birth equals one year of life.”

Typical ages are examples only. Every chart is different:

| Cycle | Typical age, approximate |
|---|---|
| Saturn square | 7, 21, 36 |
| Saturn opposition | 14 to 15, 44 |
| Saturn return | 29, 58 |
| Jupiter return | About every 12 years |
| Uranus opposition | 40 to 42 |
| Neptune square | 40 to 42 |
| Progressed Moon return | Around 27 |

### 3.3 How time windows are defined

The orb for every planet is 1 degree. A time window is the period when a planet is within 1 degree of an exact aspect, not just the moment the aspect becomes exact.

If retrograde motion causes multiple passes, and the exact passes are less than 400 days apart, they are merged into one time window. A time window can therefore have 1 to 5 exact passes. The exact times are refined using the bisection method: transits are accurate to within 1 hour, and secondary progressions to within 3 days.

Very early self-returns after birth are excluded if the first exact pass occurs before age 3. Events that never reach an exact aspect are also excluded.

The calculation range starts one month after birth and ends five years from today, no later than the end of 2035. Major time windows include Saturn return, Saturn opposition to Saturn, Uranus opposition to Uranus, conjunctions, squares, and oppositions of Saturn, Uranus, Neptune, and Pluto with the Sun, Moon, ASC, and MC; the progressed Sun changing sign; the progressed Moon conjunct ASC; and the progressed New Moon.

If you do not know your birth time, Moon, ASC, and MC time windows, as well as all progressed Moon time windows, are skipped. The Moon moves about 13 degrees per day, and the ASC moves about 1 degree every 4 minutes. Without a birth time, these events are not reliable enough.

An 80-year life takes about 1.1 seconds on average to calculate in Node. The slowest test took 2.3 seconds.

## 4. Interpretation rules

The time windows themselves tell you only the aspect and date. Titles and descriptions come from a prewritten rules table with 66 rules. Everyone gets exactly the same rules.

Each rule has a title of no more than 10 characters, two descriptions based on Western astrological tradition, 6 to 12 keywords that might appear in Taiwanese Facebook posts, and a theme. Each of the six themes has its own color, forming six color bands on screen:

| Theme | Associated content | Color |
|---|---|---|
| Structure | Saturn | Gold `#C9A96E` |
| Breakthrough | Uranus | Light blue `#9FB3CC` |
| Transformation | Pluto, progressed Sun, progressed New Moon | Gray purple `#B98CA6` |
| Expansion | Jupiter | Sage green `#A9C08F` |
| Ideals | Neptune | Blue `#8FA8C9` |
| Review | Progressed Moon | Warm gray `#C4BDB1` |

The original text of these three rules appears below, exactly as it does on the web page. Each English translation is followed by the original Chinese:

> **Saturn return**: Saturn returns to its birth position, traditionally called a coming-of-age ritual. During this period, people often reassess work, family, and life responsibilities, and build a foundation for the coming decades.
>
> **土星回歸**：土星回到出生位置，傳統上稱為成年禮。這段時間常重新確認工作、家庭與人生責任，建立接下來數十年的基礎。

> **Uranus opposition**: Uranus is opposite natal Uranus, and the direction of life needs to be redrawn. During this period, people often suddenly change jobs, move, or end an old cycle in pursuit of a more authentic self.
>
> **天王星對分**：天王星與本命天王星相對，人生路線需要重新畫線。這段時間常突然換工作、搬家或結束舊循環，追求更真實的自己。

> **Jupiter return**: Jupiter returns to its birth position, often bringing a new round of expansion and opportunity. During this period, you may want to travel abroad, continue your education, or broaden your life. It is a good time to make optimistic plans for the future.
>
> **木星回歸**：木星回到出生位置，常帶來新一輪的擴展與機會。這段時間可能想出國、進修或擴大生活範圍，適合為未來做樂觀的規劃。

DeepSeek V4 Flash drafted the 66 rules. Kimi K3 reviewed them and revised 24. Both models ran on GMI Cloud. Claude checked the final version.

## 5. Comparing posts, and an honest comparison

### 5.1 How the comparison works

For each past time window, the tool checks posts from 120 days before to 120 days after the window. It excludes hidden posts, short posts with fewer than 8 characters, shares, links, posts written by other people on your wall, birthday wishes, and cover photo changes.

A time window counts as a “match” only if one of the following is true:

1. A post from that period is analyzed as a “life turning point.”
2. A post from that period contains at least two different keywords from the rule.

The tool shows no more than two posts for each time window. Posts that meet the criteria are shown first.

### 5.2 Why comparison is essential

Time windows are long and numerous. This can make “matches” seem more meaningful than they are. In my chart, about 68% of the time after age 15 falls within a major time window. Almost any period in my life could fall within one.

So saying only “it matched” is not enough. I also need to compare the results with random periods of the same length.

For each time window, I randomly select 20 periods of the same length between the date of my first post and today. The random number generator uses a fixed seed, so the results can be reproduced. The page shows a comparison like this:

> “Of the 30 past time windows, 13 had posts with matching content. For random periods of the same length, the average was 13.”

### 5.3 My own results

I tested with my real birth data and 15 years of Facebook posts:

| Comparison | Result |
|---|---:|
| All time windows | 69 |
| Major time windows | 47 |
| Ended before my first post, so excluded from comparison | 32 |
| Time windows after I started posting | 30 |
| Time windows with posts nearby | 30 |
| Time windows that actually matched, out of 30 | 13, 43% |
| Average match rate for random periods of the same length | 44% |

I also compared my posts against the birth data of seven other people to test whether different charts would produce similar results for the same set of posts:

| Birth chart data | Percentage matched against my posts |
|---|---:|
| Taipei 1965 | 11 / 28, 39% |
| London 2001, birth time unknown | 4 / 10, 40% |
| New York 1950 | 11 / 24, 46% |
| Beijing 2008 | 10 / 24, 42% |
| Tromsø, 69.65°N, 1978 | 13 / 26, 50% |
| Taichung 1995 | 12 / 29, 41% |
| Sydney 1988 | 9 / 27, 33% |
| Average for the seven people | 42% |
| My own chart | 13 / 30, 43% |

### 5.4 What this means

Here is the direct conclusion: with my own data, my timeline did not match my life any better than random dates or the charts of strangers. This is consistent with scientific research finding no evidence that astrology can predict life events.

So the Life Timeline is not evidence, and it is not a prediction.

It still has some practical uses. It offers a fixed, shared vocabulary for life chapters, such as Saturn return and Uranus opposition around age 40. Different people can use the same names to talk about periods in life. It can also organize your Facebook posts by time window, so you can look back at what you wrote from another perspective.

For the parallel life, it provides a consistent clock for turning points. Real life and fictional life look at the same sky, but can make different choices.

I put this comparison directly on the page. I do not hide the random results or the results from strangers.

## 6. Verification and testing

The automated test file is `agentbox/tests/astro.test.mjs`. Run it like this:

```bash
npm install --no-save astronomy-engine@2.1.19
node agentbox/tests/astro.test.mjs
```

The current result is 314 checks passed and 0 failed.

The tests include:

- Three reference charts: Taipei 1965, London 1978, and a 2001 chart. They compare Saturn return, Jupiter return, and progressed Sun sign changes with Swiss Ephemeris. The exact times for Saturn return and Jupiter return differ by less than 2 days. The progressed Sun sign change differs by less than 5 days and changes to the correct new sign.
- 300 sets of random birth data. About 70% have a birth time, and about 15% use custom coordinates. These include high-latitude locations and use a fixed UTC offset.
- Checks that time windows are sorted, each time window has an exact pass, ages are not negative, every rule exists in the rules table, unknown birth times do not produce Moon, ASC, or MC time windows, and coverage is between 0 and 1.
- If the calculation range covers ages 27 to 31, there should be a Saturn return.
- Checks of rule text, post filtering and counting, whether the asynchronous version matches the synchronous version, and whether the slowest chart completes within 5 seconds.

GitHub Actions runs these tests on every update and before building the Docker image.

There are also browser tests using Playwright and Chromium. They use my data and seven other sets of birth data, and go through the birth chart, Life Timeline, parallel life panel, and the big screen in the screening room to check for page errors.

## 7. Limits

- This is not a prediction or advice. Do not use it to make medical, financial, legal, or relationship decisions.
- ASC and MC time windows depend heavily on the birth time. A 4-minute difference in birth time can move the ASC by about 1 degree. This can shift slow-planet time windows by several months.
- The rule text is one interpretation of astrological tradition. Other astrologers may explain it differently.
- This currently uses only Western tropical astrology. It does not include Chinese astrology, the sidereal zodiac, or Vedic astrology techniques.
- The post comparison can only see what you posted on Facebook. Years when you posted very little will look blank.
- Keywords are in Taiwanese Traditional Chinese. Posts in other languages are unlikely to match.
- This feature is still in testing. It has only been tested with the cases above. I need real birth data from more people before I officially release it.

## 8. Privacy

The birth chart and Life Timeline are calculated entirely in your browser. Your birth date, time, and place are not uploaded or stored.

Text is sent to an AI model only when you click **Explore my birth chart in depth** 「深入解讀命格」 or **Start the simulation** 「開始推演」. **Explore my birth chart in depth** sends planetary positions, signs, degrees, houses, and aspects. **Start the simulation** sends posts near the branching point, planetary positions, and the month ranges and descriptions of major time windows after the branching point. Your birth date, time, and place themselves are not included in the prompt.

On GMI Agentbox, the model runs on GMI Cloud. When the page is opened inside Claude, Claude answers.

The demo movie does not show the author’s birth data.

## 9. Who did what

| Work | Responsible model |
|---|---|
| Planning, specifications, review, and final check | Claude (Anthropic) |
| Life Timeline engine, fixes, interface, tests, and command-line tool | GPT-6 Luna |
| First draft of the 66 rules | DeepSeek V4 Flash |
| Rule review, revision of 24 rules, and checking that the English and Chinese versions of this document match | Kimi K3 |
| Writing and translating this document | GPT-6 Luna |
| Checking the engine with Swiss Ephemeris | Claude |
| Finding problems and returning them for fixes: conjunctions misidentified when secondary progressions crossed at the opposite position; meaningless returns immediately after birth; missed Jupiter returns for long-lived charts; incorrect detection of the progressed Sun entering Aries; the asynchronous version did not yield the thread; overly broad matching rules (29 of 30 time windows counted as matches); real time windows and random periods used different criteria | Claude |

DeepSeek V4 Flash, Kimi K3, and GPT-6 Luna ran on GMI Cloud. Claude checked the results at the end.

## 10. Reporting problems

Please report problems in [GitHub Issues](https://github.com/hansai-art/reelme/issues). Include the command-line output. Using `--json` is the easiest option. Please also include the results shown by your astrology software.

Before publicly sharing someone’s full birth time, think carefully. You can use an approximate time or get the person’s consent before posting.