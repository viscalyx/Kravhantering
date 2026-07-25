# Begränsad komplett CSV-export av åtgärdsloggen

Status: Antagen 2026-07-25.

Kravhantering exporterar hela det filtrerade urvalet från `Åtgärdslogg` med
samma synkrona resursgränser och privata temporära fil som ADR 0042. Den
gemensamma CSV-gränsen avser datarader, inte krav, och exporten läser högst
gränsen plus en rad så att ett för stort urval avvisas innan en nedladdning
exponeras.

Exporten förankrar den övre ID-gränsen vid det högsta rad-ID som finns när
genereringen börjar och läser därefter med nyckelbaserad sortering på
`occurred_at DESC, id DESC` under vanlig `READ COMMITTED`. Förankringen
utesluter senare infogade rader men fryser inte medlemskapet för aktörsfilter:
samtidig dataskyddsradering kan ändra eller ta bort aktörsuppgifter innan en
rad läses och därmed göra att raden inte längre matchar filtret. Ett fryst
filtrerat medlemskap skulle kräva materialiserade rad-ID:n eller en
konsekvent snapshot. Interaktiv sidindelning och läsning för export förblir
separata, och läsning eller export skapar inga nya åtgärdsloggsposter.
