#!/usr/bin/env python3
"""
Fill in noun plural forms across resource-pack JSONs for es/pt/de/el/uk.

Uses Norwegian's coverage as the model: for every noun that has a `plural`
in the Norwegian forms block of a given pack, fills in `plural` in the
corresponding entry for es/pt/de/el/uk where a base form already exists.

In-place line-based edits preserve the file's hand-curated formatting:
single-line entries like
    "PAN": { "form": "sartén", "gender": "f" },
become
    "PAN": { "form": "sartén", "gender": "f", "plural": "sartenes" },

Entries omitted from the PLURALS map are left untouched.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PACKS = [
    "cooking", "harry_potter", "pokemon", "anime", "football",
    "music", "tourism", "everyday_life", "fashion_style", "gaming",
    "space_scifi",
]

PLURALS = {
    "es": {
        "cooking": {
            "PAN": "sartenes", "KNIFE": "cuchillos", "FORK": "tenedores",
            "SPOON": "cucharas", "SPATULA": "espátulas", "POT": "ollas",
            "CHICKEN": "pollos", "VEGETABLE": "verduras", "POTATO": "patatas",
            "SALAD": "ensaladas", "FRUIT": "frutas", "BANANA": "plátanos",
            "SOUP": "sopas", "SAUCE": "salsas", "INGREDIENT": "ingredientes",
            "OVEN": "hornos", "STOVE": "fogones", "SINK": "fregaderos",
            "FREEZER": "congeladores", "RECIPE": "recetas",
        },
        "harry_potter": {
            "WAND": "varitas", "WIZARD": "magos", "WITCH": "brujas",
            "SPELL": "hechizos", "POTION": "pociones", "SCHOOL": "escuelas",
            "CAULDRON": "calderos", "BROOM": "escobas", "OWL": "lechuzas",
            "PROFESSOR": "profesores", "STUDENT": "estudiantes",
            "ELF": "elfos", "UNICORN": "unicornios", "GIANT": "gigantes",
            "GHOST": "fantasmas", "FOREST": "bosques", "SPIDER": "arañas",
            "LIBRARY": "bibliotecas", "CLASS": "clases", "LESSON": "lecciones",
            "EXAM": "exámenes", "IDEA": "ideas", "CHANCE": "oportunidades",
            "MYSTERY": "misterios", "SECRET": "secretos", "FRIEND": "amigos",
            "ENEMY": "enemigos", "CLOAK": "capas", "DOOR": "puertas",
        },
        "pokemon": {
            "TRAINER": "entrenadores", "LEAGUE": "ligas",
            "GYM_LEADER": "líderes de gimnasio", "FOREST": "bosques",
            "CAVE": "cuevas", "TOWN": "pueblos", "BATTLE": "batallas",
            "DAMAGE": "daños", "SPEED": "velocidades",
            "STAT": "estadísticas", "ABILITY": "habilidades",
            "TYPE": "tipos", "BADGE": "medallas", "ITEM": "objetos",
            "LEVEL": "niveles", "EXPERIENCE": "experiencias",
        },
        "anime": {
            "HERO": "héroes", "VILLAIN": "villanos", "WARRIOR": "guerreros",
            "RIVAL": "rivales", "ARMOR": "armaduras", "DRAGON": "dragones",
            "DEMON": "demonios", "SPIRIT": "espíritus", "SHADOW": "sombras",
            "POWER": "poderes", "DESTINY": "destinos", "KINGDOM": "reinos",
            "TEMPLE": "templos", "BATTLE": "batallas", "CRYSTAL": "cristales",
            "SCROLL": "pergaminos", "PORTAL": "portales", "MASTER": "maestros",
            "CLAN": "clanes", "ARENA": "arenas",
        },
        "football": {
            "PITCH": "campos", "STADIUM": "estadios", "WHISTLE": "silbatos",
            "STRIKER": "delanteros", "GOALKEEPER": "porteros",
            "CAPTAIN": "capitanes", "REFEREE": "árbitros",
            "COACH": "entrenadores", "HALFTIME": "descansos",
            "FORMATION": "formaciones", "LEAGUE": "ligas",
            "SUBSTITUTE": "suplentes", "MATCH": "partidos",
            "VICTORY": "victorias", "TROPHY": "trofeos",
            "CHAMPION": "campeones", "FINAL": "finales",
        },
        "music": {
            "GUITAR": "guitarras", "DRUM": "baterías", "PIANO": "pianos",
            "VIOLIN": "violines", "MICROPHONE": "micrófonos",
            "MELODY": "melodías", "RHYTHM": "ritmos", "CHORD": "acordes",
            "HARMONY": "armonías", "CONCERT": "conciertos",
            "STAGE": "escenarios", "ENCORE": "bises",
            "SPOTLIGHT": "focos", "TOUR": "giras", "LYRIC": "letras",
            "CHORUS": "estribillos", "SOLO": "solos", "DUET": "dúos",
            "STUDIO": "estudios", "TRACK": "pistas", "REMIX": "remixes",
            "ANTHEM": "himnos", "PLAYLIST": "listas de reproducción",
            "FESTIVAL": "festivales",
        },
        "tourism": {
            "AIRPORT": "aeropuertos", "FLIGHT": "vuelos", "HOTEL": "hoteles",
            "RESERVATION": "reservas", "LOBBY": "vestíbulos",
            "CHECKOUT": "salidas", "TAXI": "taxis", "STATION": "estaciones",
            "TICKET": "billetes", "ROUTE": "rutas", "LANDMARK": "monumentos",
            "MUSEUM": "museos", "MONUMENT": "monumentos",
            "RESTAURANT": "restaurantes", "MENU": "menús",
            "WAITER": "camareros", "MARKET": "mercados",
            "SOUVENIR": "recuerdos", "PHRASEBOOK": "guías de conversación",
            "BEACH": "playas", "CATHEDRAL": "catedrales",
            "HARBOR": "puertos", "CURRENCY": "monedas",
            "EMBASSY": "embajadas", "ITINERARY": "itinerarios",
            "GUIDE": "guías",
        },
        "everyday_life": {
            "ALARM": "despertadores", "SHOWER": "duchas",
            "TOOTHBRUSH": "cepillos de dientes",
            "APARTMENT": "apartamentos", "LIVING_ROOM": "salas de estar",
            "NEIGHBOR": "vecinos", "GROCERY": "supermercados",
            "MEETING": "reuniones", "DEADLINE": "plazos",
            "STORM": "tormentas", "UMBRELLA": "paraguas",
            "FORECAST": "pronósticos", "INVITATION": "invitaciones",
            "CONVERSATION": "conversaciones", "COMPLIMENT": "cumplidos",
            "WALLET": "carteras", "BILL": "facturas",
            "BUDGET": "presupuestos", "HEADACHE": "dolores de cabeza",
            "MEDICINE": "medicinas", "APPOINTMENT": "citas",
            "LAUNDRY": "ropas sucias", "DISHES": "platos",
            "GARBAGE": "basuras", "COUCH": "sofás",
        },
        "fashion_style": {
            "JACKET": "chaquetas", "DRESS": "vestidos", "FABRIC": "telas",
            "PATTERN": "patrones", "TAILOR": "sastres",
            "RUNWAY": "pasarelas", "MODEL": "modelos",
            "COLLECTION": "colecciones", "BOUTIQUE": "boutiques",
            "WARDROBE": "guardarropas", "TREND": "tendencias",
            "NECKLACE": "collares", "LIPSTICK": "lápices de labios",
            "HAIRSTYLE": "peinados", "LOOKBOOK": "lookbooks",
            "AESTHETIC": "estéticas", "DESIGNER": "diseñadores",
            "BRAND": "marcas", "CAMPAIGN": "campañas",
            "INFLUENCER": "influencers",
        },
        "gaming": {
            "CONSOLE": "consolas", "CONTROLLER": "mandos",
            "SCREEN": "pantallas", "TIER": "niveles", "PIXEL": "píxeles",
            "AVATAR": "avatares", "BOSS": "jefes",
            "COMPANION": "compañeros", "COMBO": "combos",
            "HARM": "daños", "VITALITY": "vitalidades",
            "ACHIEVEMENT": "logros", "UPGRADE": "mejoras",
            "PARTY": "grupos", "RAID": "raids", "GEM": "gemas",
            "COOLDOWN": "tiempos de recarga", "STRATEGY": "estrategias",
            "LEADERBOARD": "tablas de clasificación", "RANK": "rangos",
            "SPEEDRUN": "speedruns",
        },
    },
    "pt": {
        "cooking": {
            "PAN": "frigideiras", "KNIFE": "facas", "FORK": "garfos",
            "SPOON": "colheres", "SPATULA": "espátulas", "POT": "panelas",
            "CHICKEN": "frangos", "VEGETABLE": "vegetais",
            "POTATO": "batatas", "SALAD": "saladas", "FRUIT": "frutas",
            "BANANA": "bananas", "SOUP": "sopas", "SAUCE": "molhos",
            "INGREDIENT": "ingredientes", "OVEN": "fornos",
            "STOVE": "fogões", "SINK": "pias",
            "FREEZER": "congeladores", "RECIPE": "receitas",
        },
        "harry_potter": {
            "WAND": "varinhas", "WIZARD": "bruxos", "WITCH": "bruxas",
            "SPELL": "feitiços", "POTION": "poções", "SCHOOL": "escolas",
            "CAULDRON": "caldeirões", "BROOM": "vassouras",
            "OWL": "corujas", "PROFESSOR": "professores",
            "STUDENT": "estudantes", "ELF": "elfos",
            "UNICORN": "unicórnios", "GIANT": "gigantes",
            "GHOST": "fantasmas", "FOREST": "florestas",
            "SPIDER": "aranhas", "LIBRARY": "bibliotecas",
            "CLASS": "aulas", "LESSON": "lições", "EXAM": "exames",
            "IDEA": "ideias", "CHANCE": "chances",
            "MYSTERY": "mistérios", "SECRET": "segredos",
            "FRIEND": "amigos", "ENEMY": "inimigos",
            "CLOAK": "capas", "DOOR": "portas",
        },
        "pokemon": {
            "TRAINER": "treinadores", "LEAGUE": "ligas",
            "GYM_LEADER": "líderes de ginásio", "FOREST": "florestas",
            "CAVE": "cavernas", "TOWN": "cidades", "BATTLE": "batalhas",
            "DAMAGE": "danos", "SPEED": "velocidades",
            "STAT": "estatísticas", "ABILITY": "habilidades",
            "TYPE": "tipos", "BADGE": "insígnias", "ITEM": "itens",
            "LEVEL": "níveis", "EXPERIENCE": "experiências",
        },
        "anime": {
            "HERO": "heróis", "VILLAIN": "vilões", "WARRIOR": "guerreiros",
            "RIVAL": "rivais", "ARMOR": "armaduras", "DRAGON": "dragões",
            "DEMON": "demônios", "SPIRIT": "espíritos",
            "SHADOW": "sombras", "POWER": "poderes",
            "DESTINY": "destinos", "KINGDOM": "reinos",
            "TEMPLE": "templos", "BATTLE": "batalhas",
            "CRYSTAL": "cristais", "SCROLL": "pergaminhos",
            "PORTAL": "portais", "MASTER": "mestres",
            "CLAN": "clãs", "ARENA": "arenas",
        },
        "football": {
            "PITCH": "campos", "STADIUM": "estádios", "WHISTLE": "apitos",
            "STRIKER": "atacantes", "GOALKEEPER": "goleiros",
            "CAPTAIN": "capitães", "REFEREE": "árbitros",
            "COACH": "treinadores", "HALFTIME": "intervalos",
            "FORMATION": "formações", "LEAGUE": "ligas",
            "SUBSTITUTE": "substitutos", "MATCH": "partidas",
            "VICTORY": "vitórias", "TROPHY": "troféus",
            "CHAMPION": "campeões", "FINAL": "finais",
        },
        "music": {
            "GUITAR": "guitarras", "DRUM": "baterias", "PIANO": "pianos",
            "VIOLIN": "violinos", "MICROPHONE": "microfones",
            "MELODY": "melodias", "RHYTHM": "ritmos",
            "CHORD": "acordes", "HARMONY": "harmonias",
            "CONCERT": "concertos", "STAGE": "palcos",
            "ENCORE": "bis", "SPOTLIGHT": "holofotes",
            "TOUR": "turnês", "LYRIC": "letras",
            "CHORUS": "refrões", "SOLO": "solos", "DUET": "duetos",
            "STUDIO": "estúdios", "TRACK": "faixas",
            "REMIX": "remixes", "ANTHEM": "hinos",
            "PLAYLIST": "playlists", "FESTIVAL": "festivais",
        },
        "tourism": {
            "AIRPORT": "aeroportos", "FLIGHT": "voos", "HOTEL": "hotéis",
            "RESERVATION": "reservas", "LOBBY": "saguões",
            "CHECKOUT": "saídas", "TAXI": "táxis",
            "STATION": "estações", "TICKET": "bilhetes",
            "ROUTE": "rotas", "LANDMARK": "pontos turísticos",
            "MUSEUM": "museus", "MONUMENT": "monumentos",
            "RESTAURANT": "restaurantes", "MENU": "cardápios",
            "WAITER": "garçons", "MARKET": "mercados",
            "SOUVENIR": "souvenirs",
            "PHRASEBOOK": "guias de conversação",
            "BEACH": "praias", "CATHEDRAL": "catedrais",
            "HARBOR": "portos", "CURRENCY": "moedas",
            "EMBASSY": "embaixadas", "ITINERARY": "itinerários",
            "GUIDE": "guias",
        },
        "everyday_life": {
            "ALARM": "alarmes", "SHOWER": "chuveiros",
            "TOOTHBRUSH": "escovas de dentes",
            "APARTMENT": "apartamentos", "LIVING_ROOM": "salas de estar",
            "NEIGHBOR": "vizinhos", "GROCERY": "mercearias",
            "MEETING": "reuniões", "DEADLINE": "prazos",
            "STORM": "tempestades", "UMBRELLA": "guarda-chuvas",
            "FORECAST": "previsões", "INVITATION": "convites",
            "CONVERSATION": "conversas", "COMPLIMENT": "elogios",
            "WALLET": "carteiras", "BILL": "contas",
            "BUDGET": "orçamentos", "HEADACHE": "dores de cabeça",
            "MEDICINE": "remédios", "APPOINTMENT": "consultas",
            "LAUNDRY": "roupas sujas", "DISHES": "louças",
            "GARBAGE": "lixos", "COUCH": "sofás",
        },
        "fashion_style": {
            "JACKET": "jaquetas", "DRESS": "vestidos",
            "FABRIC": "tecidos", "PATTERN": "estampas",
            "TAILOR": "alfaiates", "RUNWAY": "passarelas",
            "MODEL": "modelos", "COLLECTION": "coleções",
            "BOUTIQUE": "boutiques", "WARDROBE": "guarda-roupas",
            "TREND": "tendências", "NECKLACE": "colares",
            "LIPSTICK": "batons", "HAIRSTYLE": "penteados",
            "LOOKBOOK": "lookbooks", "AESTHETIC": "estéticas",
            "DESIGNER": "estilistas", "BRAND": "marcas",
            "CAMPAIGN": "campanhas", "INFLUENCER": "influencers",
        },
        "gaming": {
            "CONSOLE": "consoles", "CONTROLLER": "controles",
            "SCREEN": "telas", "TIER": "níveis", "PIXEL": "pixels",
            "AVATAR": "avatares", "BOSS": "chefes",
            "COMPANION": "companheiros", "COMBO": "combos",
            "HARM": "danos", "VITALITY": "vitalidades",
            "ACHIEVEMENT": "conquistas", "UPGRADE": "melhorias",
            "PARTY": "grupos", "RAID": "raids", "GEM": "gemas",
            "COOLDOWN": "tempos de espera", "STRATEGY": "estratégias",
            "LEADERBOARD": "placares", "RANK": "classificações",
            "SPEEDRUN": "corridas de velocidade",
        },
    },
    "de": {
        "anime": {
            "HERO": "Helden", "VILLAIN": "Bösewichte", "WARRIOR": "Krieger",
            "RIVAL": "Rivalen", "ARMOR": "Rüstungen", "DRAGON": "Drachen",
            "DEMON": "Dämonen", "SPIRIT": "Geister",
            "SHADOW": "Schatten", "POWER": "Kräfte",
            "DESTINY": "Schicksale", "KINGDOM": "Königreiche",
            "TEMPLE": "Tempel", "BATTLE": "Kämpfe",
            "CRYSTAL": "Kristalle", "SCROLL": "Schriftrollen",
            "PORTAL": "Portale", "MASTER": "Meister",
            "CLAN": "Clans", "ARENA": "Arenen",
        },
        "football": {
            "PITCH": "Spielfelder", "STADIUM": "Stadien",
            "WHISTLE": "Pfeifen", "STRIKER": "Stürmer",
            "GOALKEEPER": "Torwarte", "CAPTAIN": "Kapitäne",
            "REFEREE": "Schiedsrichter", "COACH": "Trainer",
            "HALFTIME": "Halbzeiten", "FORMATION": "Formationen",
            "LEAGUE": "Ligen", "SUBSTITUTE": "Ersatzspieler",
            "MATCH": "Spiele", "VICTORY": "Siege",
            "TROPHY": "Pokale", "CHAMPION": "Meister",
            "FINAL": "Finale",
        },
        "music": {
            "GUITAR": "Gitarren", "DRUM": "Trommeln",
            "PIANO": "Klaviere", "VIOLIN": "Geigen",
            "MICROPHONE": "Mikrofone", "MELODY": "Melodien",
            "RHYTHM": "Rhythmen", "CHORD": "Akkorde",
            "HARMONY": "Harmonien", "CONCERT": "Konzerte",
            "STAGE": "Bühnen", "ENCORE": "Zugaben",
            "SPOTLIGHT": "Scheinwerfer", "TOUR": "Tourneen",
            "LYRIC": "Liedtexte", "CHORUS": "Refrains",
            "SOLO": "Solos", "DUET": "Duette",
            "STUDIO": "Studios", "TRACK": "Tracks",
            "REMIX": "Remixe", "ANTHEM": "Hymnen",
            "PLAYLIST": "Playlists", "FESTIVAL": "Festivals",
        },
        "tourism": {
            "AIRPORT": "Flughäfen", "FLIGHT": "Flüge",
            "HOTEL": "Hotels", "RESERVATION": "Reservierungen",
            "LOBBY": "Lobbys", "CHECKOUT": "Abreisen",
            "TAXI": "Taxis", "STATION": "Bahnhöfe",
            "TICKET": "Fahrkarten", "ROUTE": "Routen",
            "LANDMARK": "Wahrzeichen", "MUSEUM": "Museen",
            "MONUMENT": "Denkmäler", "RESTAURANT": "Restaurants",
            "MENU": "Speisekarten", "WAITER": "Kellner",
            "MARKET": "Märkte", "SOUVENIR": "Souvenirs",
            "PHRASEBOOK": "Sprachführer", "BEACH": "Strände",
            "CATHEDRAL": "Kathedralen", "HARBOR": "Häfen",
            "CURRENCY": "Währungen", "EMBASSY": "Botschaften",
            "ITINERARY": "Reisepläne", "GUIDE": "Reiseführer",
        },
        "everyday_life": {
            "ALARM": "Wecker", "SHOWER": "Duschen",
            "TOOTHBRUSH": "Zahnbürsten", "APARTMENT": "Wohnungen",
            "LIVING_ROOM": "Wohnzimmer", "NEIGHBOR": "Nachbarn",
            "GROCERY": "Lebensmittelläden", "MEETING": "Besprechungen",
            "DEADLINE": "Fristen", "STORM": "Stürme",
            "UMBRELLA": "Regenschirme", "FORECAST": "Wettervorhersagen",
            "INVITATION": "Einladungen", "CONVERSATION": "Gespräche",
            "COMPLIMENT": "Komplimente", "WALLET": "Geldbeutel",
            "BILL": "Rechnungen", "BUDGET": "Budgets",
            "HEADACHE": "Kopfschmerzen", "MEDICINE": "Medikamente",
            "APPOINTMENT": "Termine", "LAUNDRY": "Wäschestücke",
            "DISHES": "Geschirre", "GARBAGE": "Müllsorten",
            "COUCH": "Sofas",
        },
        "fashion_style": {
            "JACKET": "Jacken", "DRESS": "Kleider",
            "FABRIC": "Stoffe", "PATTERN": "Muster",
            "TAILOR": "Schneider", "RUNWAY": "Laufstege",
            "MODEL": "Models", "COLLECTION": "Kollektionen",
            "BOUTIQUE": "Boutiquen", "WARDROBE": "Kleiderschränke",
            "TREND": "Trends", "NECKLACE": "Halsketten",
            "LIPSTICK": "Lippenstifte", "HAIRSTYLE": "Frisuren",
            "LOOKBOOK": "Lookbooks", "AESTHETIC": "Ästhetiken",
            "DESIGNER": "Designer", "BRAND": "Marken",
            "CAMPAIGN": "Kampagnen", "INFLUENCER": "Influencer",
        },
        "gaming": {
            "CONSOLE": "Konsolen", "CONTROLLER": "Controller",
            "SCREEN": "Bildschirme", "TIER": "Stufen",
            "PIXEL": "Pixel", "AVATAR": "Avatare",
            "BOSS": "Bossgegner", "COMPANION": "Begleiter",
            "COMBO": "Kombos", "HARM": "Schäden",
            "VITALITY": "Vitalitäten", "ACHIEVEMENT": "Leistungen",
            "UPGRADE": "Upgrades", "PARTY": "Gruppen",
            "RAID": "Raids", "GEM": "Edelsteine",
            "COOLDOWN": "Abklingzeiten", "STRATEGY": "Strategien",
            "LEADERBOARD": "Bestenlisten", "RANK": "Ränge",
            "SPEEDRUN": "Speedruns",
        },
    },
    "el": {
        "anime": {
            "HERO": "ήρωες", "VILLAIN": "κακοί", "WARRIOR": "πολεμιστές",
            "RIVAL": "αντίπαλοι", "ARMOR": "πανοπλίες",
            "DRAGON": "δράκοι", "DEMON": "δαίμονες",
            "SPIRIT": "πνεύματα", "SHADOW": "σκιές",
            "POWER": "δυνάμεις", "DESTINY": "μοίρες",
            "KINGDOM": "βασίλεια", "TEMPLE": "ναοί",
            "BATTLE": "μάχες", "CRYSTAL": "κρύσταλλοι",
            "SCROLL": "κύλινδροι", "PORTAL": "πύλες",
            "MASTER": "δάσκαλοι", "CLAN": "κλαν",
            "ARENA": "αρένες",
        },
        "football": {
            "PITCH": "γήπεδα", "STADIUM": "στάδια",
            "WHISTLE": "σφυρίχτρες", "STRIKER": "επιθετικοί",
            "GOALKEEPER": "τερματοφύλακες", "CAPTAIN": "αρχηγοί",
            "REFEREE": "διαιτητές", "COACH": "προπονητές",
            "HALFTIME": "ημίχρονα", "FORMATION": "σχηματισμοί",
            "LEAGUE": "πρωταθλήματα", "SUBSTITUTE": "αντικαταστάτες",
            "MATCH": "αγώνες", "VICTORY": "νίκες",
            "TROPHY": "τρόπαια", "CHAMPION": "πρωταθλητές",
            "FINAL": "τελικοί",
        },
        "music": {
            "GUITAR": "κιθάρες", "DRUM": "τύμπανα",
            "PIANO": "πιάνα", "VIOLIN": "βιολιά",
            "MICROPHONE": "μικρόφωνα", "MELODY": "μελωδίες",
            "RHYTHM": "ρυθμοί", "CHORD": "συγχορδίες",
            "HARMONY": "αρμονίες", "CONCERT": "συναυλίες",
            "STAGE": "σκηνές", "ENCORE": "άγκορ",
            "SPOTLIGHT": "προβολείς", "TOUR": "περιοδείες",
            "LYRIC": "στίχοι", "CHORUS": "ρεφρέν",
            "SOLO": "σόλο", "DUET": "ντουέτα",
            "STUDIO": "στούντιο", "TRACK": "κομμάτια",
            "REMIX": "ρίμιξ", "ANTHEM": "ύμνοι",
            "PLAYLIST": "λίστες αναπαραγωγής",
            "FESTIVAL": "φεστιβάλ",
        },
        "tourism": {
            "AIRPORT": "αεροδρόμια", "FLIGHT": "πτήσεις",
            "HOTEL": "ξενοδοχεία", "RESERVATION": "κρατήσεις",
            "LOBBY": "λόμπι", "CHECKOUT": "αναχωρήσεις",
            "TAXI": "ταξί", "STATION": "σταθμοί",
            "TICKET": "εισιτήρια", "ROUTE": "διαδρομές",
            "LANDMARK": "αξιοθέατα", "MUSEUM": "μουσεία",
            "MONUMENT": "μνημεία", "RESTAURANT": "εστιατόρια",
            "MENU": "μενού", "WAITER": "σερβιτόροι",
            "MARKET": "αγορές", "SOUVENIR": "αναμνηστικά",
            "PHRASEBOOK": "φρασολόγια", "BEACH": "παραλίες",
            "CATHEDRAL": "καθεδρικοί ναοί", "HARBOR": "λιμάνια",
            "CURRENCY": "νομίσματα", "EMBASSY": "πρεσβείες",
            "ITINERARY": "δρομολόγια", "GUIDE": "ξεναγοί",
        },
        "everyday_life": {
            "ALARM": "ξυπνητήρια", "SHOWER": "ντους",
            "TOOTHBRUSH": "οδοντόβουρτσες",
            "APARTMENT": "διαμερίσματα", "LIVING_ROOM": "σαλόνια",
            "NEIGHBOR": "γείτονες", "GROCERY": "παντοπωλεία",
            "MEETING": "συναντήσεις", "DEADLINE": "προθεσμίες",
            "STORM": "καταιγίδες", "UMBRELLA": "ομπρέλες",
            "FORECAST": "προγνώσεις", "INVITATION": "προσκλήσεις",
            "CONVERSATION": "συνομιλίες", "COMPLIMENT": "κομπλιμέντα",
            "WALLET": "πορτοφόλια", "BILL": "λογαριασμοί",
            "BUDGET": "προϋπολογισμοί", "HEADACHE": "πονοκέφαλοι",
            "MEDICINE": "φάρμακα", "APPOINTMENT": "ραντεβού",
            "LAUNDRY": "μπουγάδες", "DISHES": "πιάτα",
            "GARBAGE": "σκουπίδια", "COUCH": "καναπέδες",
        },
        "fashion_style": {
            "JACKET": "μπουφάν", "DRESS": "φορέματα",
            "FABRIC": "υφάσματα", "PATTERN": "μοτίβα",
            "TAILOR": "ράφτες", "RUNWAY": "πασαρέλες",
            "MODEL": "μοντέλα", "COLLECTION": "συλλογές",
            "BOUTIQUE": "μπουτίκ", "WARDROBE": "γκαρνταρόμπες",
            "TREND": "τάσεις", "NECKLACE": "κολιέ",
            "LIPSTICK": "κραγιόν", "HAIRSTYLE": "χτενίσματα",
            "LOOKBOOK": "λούκμπουκ", "AESTHETIC": "αισθητικές",
            "DESIGNER": "σχεδιαστές", "BRAND": "μάρκες",
            "CAMPAIGN": "καμπάνιες", "INFLUENCER": "ινφλουένσερ",
        },
        "gaming": {
            "CONSOLE": "κονσόλες", "CONTROLLER": "χειριστήρια",
            "SCREEN": "οθόνες", "TIER": "βαθμίδες",
            "PIXEL": "εικονοστοιχεία", "AVATAR": "άβαταρ",
            "BOSS": "αφεντικά", "COMPANION": "σύντροφοι",
            "COMBO": "κόμπο", "HARM": "βλάβες",
            "VITALITY": "ζωτικότητες", "ACHIEVEMENT": "επιτεύγματα",
            "UPGRADE": "αναβαθμίσεις", "PARTY": "ομάδες",
            "RAID": "επιδρομές", "GEM": "πολύτιμοι λίθοι",
            "COOLDOWN": "χρόνοι ανάκτησης", "STRATEGY": "στρατηγικές",
            "LEADERBOARD": "πίνακες κατάταξης", "RANK": "βαθμοί",
            "SPEEDRUN": "γρήγοροι τερματισμοί",
        },
    },
    "uk": {
        "cooking": {
            "PAN": "сковороди", "KNIFE": "ножі", "FORK": "виделки",
            "SPOON": "ложки", "SPATULA": "лопатки", "POT": "каструлі",
            "CHICKEN": "курки", "VEGETABLE": "овочі",
            "POTATO": "картоплі", "SALAD": "салати", "FRUIT": "фрукти",
            "BANANA": "банани", "SOUP": "супи", "SAUCE": "соуси",
            "INGREDIENT": "інгредієнти", "OVEN": "духовки",
            "STOVE": "плити", "SINK": "раковини",
            "FREEZER": "морозильники", "RECIPE": "рецепти",
        },
        "harry_potter": {
            "WAND": "палички", "WIZARD": "чарівники",
            "WITCH": "відьми", "SPELL": "закляття",
            "POTION": "зілля", "SCHOOL": "школи",
            "CAULDRON": "казани", "BROOM": "мітли",
            "OWL": "сови", "PROFESSOR": "професори",
            "STUDENT": "студенти", "ELF": "ельфи",
            "UNICORN": "єдинороги", "GIANT": "велетні",
            "GHOST": "привиди", "FOREST": "ліси",
            "SPIDER": "павуки", "LIBRARY": "бібліотеки",
            "CLASS": "класи", "LESSON": "уроки",
            "EXAM": "іспити", "IDEA": "ідеї",
            "CHANCE": "шанси", "MYSTERY": "таємниці",
            "SECRET": "секрети", "FRIEND": "друзі",
            "ENEMY": "вороги", "CLOAK": "мантії",
            "DOOR": "двері",
        },
        "pokemon": {
            "TRAINER": "тренери", "LEAGUE": "ліги",
            "GYM_LEADER": "лідери залів", "FOREST": "ліси",
            "CAVE": "печери", "TOWN": "міста",
            "BATTLE": "битви", "DAMAGE": "пошкодження",
            "SPEED": "швидкості", "STAT": "статистики",
            "ABILITY": "здібності", "TYPE": "типи",
            "BADGE": "значки", "ITEM": "предмети",
            "LEVEL": "рівні", "EXPERIENCE": "досвіди",
        },
        "anime": {
            "HERO": "герої", "VILLAIN": "лиходії",
            "WARRIOR": "воїни", "RIVAL": "суперники",
            "ARMOR": "броні", "DRAGON": "дракони",
            "DEMON": "демони", "SPIRIT": "духи",
            "SHADOW": "тіні", "POWER": "сили",
            "DESTINY": "долі", "KINGDOM": "королівства",
            "TEMPLE": "храми", "BATTLE": "битви",
            "CRYSTAL": "кристали", "SCROLL": "сувої",
            "PORTAL": "портали", "MASTER": "майстри",
            "CLAN": "клани", "ARENA": "арени",
        },
        "football": {
            "PITCH": "поля", "STADIUM": "стадіони",
            "WHISTLE": "свистки", "STRIKER": "нападники",
            "GOALKEEPER": "воротарі", "CAPTAIN": "капітани",
            "REFEREE": "судді", "COACH": "тренери",
            "HALFTIME": "перерви", "FORMATION": "формації",
            "LEAGUE": "ліги", "SUBSTITUTE": "запасні гравці",
            "MATCH": "матчі", "VICTORY": "перемоги",
            "TROPHY": "трофеї", "CHAMPION": "чемпіони",
            "FINAL": "фінали",
        },
        "music": {
            "GUITAR": "гітари", "DRUM": "барабани",
            "PIANO": "фортепіано", "VIOLIN": "скрипки",
            "MICROPHONE": "мікрофони", "MELODY": "мелодії",
            "RHYTHM": "ритми", "CHORD": "акорди",
            "HARMONY": "гармонії", "CONCERT": "концерти",
            "STAGE": "сцени", "ENCORE": "анкори",
            "SPOTLIGHT": "прожектори", "TOUR": "тури",
            "LYRIC": "тексти пісень", "CHORUS": "приспіви",
            "SOLO": "соло", "DUET": "дуети",
            "STUDIO": "студії", "TRACK": "треки",
            "REMIX": "ремікси", "ANTHEM": "гімни",
            "PLAYLIST": "плейлисти", "FESTIVAL": "фестивалі",
        },
        "tourism": {
            "AIRPORT": "аеропорти", "FLIGHT": "рейси",
            "HOTEL": "готелі", "RESERVATION": "бронювання",
            "LOBBY": "лобі", "CHECKOUT": "виїзди",
            "TAXI": "таксі", "STATION": "станції",
            "TICKET": "квитки", "ROUTE": "маршрути",
            "LANDMARK": "пам'ятки", "MUSEUM": "музеї",
            "MONUMENT": "пам'ятники", "RESTAURANT": "ресторани",
            "MENU": "меню", "WAITER": "офіціанти",
            "MARKET": "ринки", "SOUVENIR": "сувеніри",
            "PHRASEBOOK": "розмовники", "BEACH": "пляжі",
            "CATHEDRAL": "собори", "HARBOR": "гавані",
            "CURRENCY": "валюти", "EMBASSY": "посольства",
            "ITINERARY": "маршрути подорожі", "GUIDE": "гіди",
        },
        "everyday_life": {
            "ALARM": "будильники", "SHOWER": "душі",
            "TOOTHBRUSH": "зубні щітки", "APARTMENT": "квартири",
            "LIVING_ROOM": "вітальні", "NEIGHBOR": "сусіди",
            "GROCERY": "продуктові магазини",
            "MEETING": "зустрічі", "DEADLINE": "дедлайни",
            "STORM": "бурі", "UMBRELLA": "парасольки",
            "FORECAST": "прогнози", "INVITATION": "запрошення",
            "CONVERSATION": "розмови", "COMPLIMENT": "компліменти",
            "WALLET": "гаманці", "BILL": "рахунки",
            "BUDGET": "бюджети", "HEADACHE": "головні болі",
            "MEDICINE": "ліки", "APPOINTMENT": "записи",
            "LAUNDRY": "прання", "DISHES": "посуди",
            "GARBAGE": "сміття", "COUCH": "дивани",
        },
        "fashion_style": {
            "JACKET": "куртки", "DRESS": "сукні",
            "FABRIC": "тканини", "PATTERN": "візерунки",
            "TAILOR": "кравці", "RUNWAY": "подіуми",
            "MODEL": "моделі", "COLLECTION": "колекції",
            "BOUTIQUE": "бутіки", "WARDROBE": "гардероби",
            "TREND": "тренди", "NECKLACE": "намиста",
            "LIPSTICK": "помади", "HAIRSTYLE": "зачіски",
            "LOOKBOOK": "лукбуки", "AESTHETIC": "естетики",
            "DESIGNER": "дизайнери", "BRAND": "бренди",
            "CAMPAIGN": "кампанії", "INFLUENCER": "інфлюенсери",
        },
        "gaming": {
            "CONSOLE": "консолі", "CONTROLLER": "контролери",
            "SCREEN": "екрани", "TIER": "рівні",
            "PIXEL": "пікселі", "AVATAR": "аватари",
            "BOSS": "боси", "COMPANION": "супутники",
            "COMBO": "комбо", "HARM": "шкоди",
            "VITALITY": "живучості", "ACHIEVEMENT": "досягнення",
            "UPGRADE": "покращення", "PARTY": "загони",
            "RAID": "рейди", "GEM": "самоцвіти",
            "COOLDOWN": "часи перезарядки", "STRATEGY": "стратегії",
            "LEADERBOARD": "таблиці лідерів", "RANK": "ранги",
            "SPEEDRUN": "спідрани",
        },
    },
}

# Track which language section we're in by matching the indented language key lines
# inside the "languages": { ... } block.
LANG_HEADER = re.compile(r'^(\s*)"(ar|de|el|en|es|fr|ja|ko|no|pt|tr|uk|zh)"\s*:\s*\{\s*$')
# Match a single-line forms entry: e.g.   "PAN": { "form": "sartén", "gender": "f" },
# Capture the cid, the body up to the closing brace, and the optional trailing comma.
ENTRY_RE = re.compile(r'^(\s*)"([A-Z][A-Z0-9_]*)"\s*:\s*\{\s*(.*?)\s*\}(\s*,?\s*)$')


def update_pack(pack):
    path = os.path.join(ROOT, pack + ".json")
    with open(path, "rb") as f:
        raw = f.read()
    eol = b"\r\n" if b"\r\n" in raw else b"\n"
    text = raw.decode("utf-8")
    # Split on the detected EOL so we can rejoin with the same terminator.
    use_crlf = eol == b"\r\n"
    if use_crlf:
        lines = text.split("\r\n")
    else:
        lines = text.split("\n")

    current_lang = None
    pack_plurals = {lang: PLURALS.get(lang, {}).get(pack, {}) for lang in ("es","pt","de","el","uk")}
    changes = 0

    out = []
    for line in lines:
        m_lang = LANG_HEADER.match(line)
        if m_lang:
            current_lang = m_lang.group(2)
            out.append(line)
            continue
        if current_lang in pack_plurals:
            m_entry = ENTRY_RE.match(line)
            if m_entry:
                cid = m_entry.group(2)
                body = m_entry.group(3)
                trailing = m_entry.group(4)
                indent = m_entry.group(1)
                plural = pack_plurals[current_lang].get(cid)
                if (plural and '"plural"' not in body and '"form"' in body
                        and '"pluralOnly"' not in body
                        and '"invariantPlural"' not in body):
                    new_body = body.rstrip()
                    if new_body.endswith(","):
                        new_body = new_body[:-1].rstrip()
                    new_body = new_body + f', "plural": "{plural}"'
                    out.append(f'{indent}"{cid}": {{ {new_body} }}{trailing}')
                    changes += 1
                    continue
        out.append(line)

    joiner = "\r\n" if use_crlf else "\n"
    new_text = joiner.join(out)
    # Validate as JSON before writing back
    try:
        json.loads(new_text)
    except json.JSONDecodeError as e:
        print(f"  ERROR: {pack} would not parse as JSON: {e}")
        return 0
    if new_text.encode("utf-8") != raw:
        with open(path, "wb") as f:
            f.write(new_text.encode("utf-8"))
    return changes


def main():
    total = 0
    for pack in PACKS:
        n = update_pack(pack)
        if n:
            print(f"  {pack}: {n} plurals added")
        total += n
    print(f"\nTotal plurals added: {total}")


if __name__ == "__main__":
    main()
