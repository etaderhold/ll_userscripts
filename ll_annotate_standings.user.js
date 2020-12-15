// ==UserScript==
// @name         LL Standings annotations
// @namespace    http://eric.aderhold.us/
// @version      0.1.3
// @description  Put notes in LL standings pages if clinched promotion/relegation/staying put
// @author       AderholdE
// @match        https://learnedleague.com/standings.php?*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const standings = $('table.sortable tbody');

    const standingsArray = standings.children().map(function() {
        return [$(this).children().toArray().map(element => element.innerText)];
    });

    const match = window.location.href.match(/&(.)_/);
    if (match == null) {
        return;
    }
    const rundle = match[1];
    if (rundle == 'R') {
        // R rundles not supported yet
        return;
    }

    const data = [];
    let i = 1;
    standings.children().each(function() {
        const tr = $(this);
        const promotionZone = tr.children().first().hasClass('d3');
        const relegationZone = tr.children().first().hasClass('d4');

        const rank = i++;
        const dataRow = standingsArray[rank - 1];
        data.push({
            rank : +dataRow[0],
            promotionZone: promotionZone,
            relegationZone: relegationZone,
            wins : +dataRow[3],
            losses: +dataRow[4],
            ties: +dataRow[5],
            mpd: +dataRow[7],
            tmp: +dataRow[8],
            forfeits: +dataRow[16]
        });
    });

    if (data.length) {
        const maxPromo = data.filter(row => row.promotionZone).length;
        const minRelegation = data.findIndex(row => row.relegationZone) + 1;
        const gamesPlayed = data[0].wins + data[0].losses + data[0].ties;
        const gamesRemaining = 25 - gamesPlayed;
        const bestCase = data.map(row => {
            return {
                rank: row.rank,
                wins: row.wins + gamesRemaining,
                losses: row.losses,
                ties: row.ties,
                mpd: row.mpd + 9 * gamesRemaining,
                tmp: row.tmp + 9 * gamesRemaining,
                forfeits: row.forfeits
            };
        });

        const worstCase = data.map(row => {
            return {
                rank: row.rank,
                wins: row.wins,
                losses: row.losses + gamesRemaining,
                ties: row.ties,
                mpd: row.mpd - 9 * gamesRemaining,
                tmp: row.tmp,
                forfeits: row.forfeits
            };
        });

        const worstCaseWithForfeits = data.map(row => {
            return {
                rank: row.rank,
                wins: row.wins,
                losses: row.losses + gamesRemaining,
                ties: row.ties,
                mpd: row.mpd - 9 * gamesRemaining,
                tmp: row.tmp,
                forfeits: row.forfeits + gamesRemaining
            };
        });

        data.forEach((row, i) => {
            const worstFinish = getTheoreticalPosition(worstCase[i], bestCase);
            const worstFinishForfeits = getTheoreticalPosition(worstCaseWithForfeits[i], bestCase);
            const bestFinish = getTheoreticalPosition(bestCase[i], worstCase);
            const bestFinishWithForfeits = getTheoreticalPosition(bestCase[i], worstCaseWithForfeits);

            // Rule 19.3: Forfeit three or more times and you may have to sit out a season.
            // Rule 12: Players returning after a break return to the same rundle they would have otherwise qualified
            // for in their last season played, EXCEPT no guarantees if that rundle is A or B (depends on space available).
            if (worstFinishForfeits <= maxPromo &&
                (row.forfeits + gamesRemaining < 3 || (rundle != 'A' && rundle != 'B'))) {
                row.letter = 'Z';
            } else if (worstFinish <= maxPromo && (row.forfeits < 3 || (rundle != 'A' && rundle != 'B'))) {
                row.letter = 'z';
            }

            if (worstFinishForfeits < minRelegation) {
                if (bestFinishWithForfeits > maxPromo &&
                    (row.forfeits + gamesRemaining < 3 || (rundle != 'A' && rundle != 'B'))) {
                    row.letter = 'Y';
                } else if (bestFinish > maxPromo) {
                    row.letter = 'y';
                }
            } else if (worstFinish < minRelegation) {
                if (bestFinish > maxPromo) {
                    row.letter = 'y';
                }
            }

            if (bestFinishWithForfeits >= minRelegation) {
                row.letter = 'X';
            } else if (bestFinish >= minRelegation) {
                row.letter = 'x';
            }

            if (row.forfeits >= 3 && (rundle == 'A' || rundle == 'B')) {
                row.letter = 'F';
            }
        });
    }

    i = 0;
    standings.children().each(function() {
        const tr = $(this);
        const letter = data[i++].letter;
        if (letter) {
            tr.children().eq(2).children().first().after(`&nbsp;${letter}&nbsp;–`);
        }
    });

    const lettersUsed = data.filter(row => row.letter).map(row => row.letter).filter((item, index, array) => array.indexOf(item) == index);
    if (lettersUsed.length) {
        const promoText = rundle == 'A' ? 'berth in LL championship' : 'promotion';
        const stayText = rundle == 'A' ? ', and eliminated from LL championship contention' : '';
        $("#lft > div:nth-child(3)").append(`Standings annotations key:<br />
            ${lettersUsed.includes('Z') ? `Z - Clinched ${promoText} <br/>` : ''}
            ${lettersUsed.includes('z') ? `z - Clinched ${promoText} (barring forfeits) <br />` : ''}
            ${lettersUsed.includes('Y') ? `Y - Clinched remaining in the same rundle${stayText}<br />` : ''}
            ${lettersUsed.includes('y') ? `y - Clinched remaining in the same rundle (barring forfeits)${stayText} <br />` : ''}
            ${lettersUsed.includes('X') ? 'X - Clinched relegation <br />' : ''}
            ${lettersUsed.includes('x') ? 'x - Clinched relegation (barring assistance from forfeits) <br />' : ''}
            ${lettersUsed.includes('F') ? 'F - Forfeited three or more times. May be excluded from the next season. If so, return to this rundle would be conditioned on space being available.' : ''}`);
    }


    function getTheoreticalPosition(you, everyoneElse) {
            const test = everyoneElse.filter(row => row.rank != you.rank);
            test.push(you);
            test.sort(compareRows);
            const finish = test.findIndex(row => row.rank == you.rank) + 1;
            return finish;
    }

    function points(row) {
        return 2 * row.wins + row.ties - row.forfeits;
    }

    function compareRows(a, b) {
        if (points(a) < points(b)) {
            return 1;
        }
        if (points(a) > points(b)) {
            return -1;
        }
        if (a.mpd < b.mpd) {
            return 1;
        }
        if (a.mpd > b.mpd) {
            return -1;
        }
        if (a.tmp < b.tmp) {
            return 1;
        }
        if (a.tmp > b.tmp) {
            return -1;
        }
        return 0;
    }
})();