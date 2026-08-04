"""Static, bilingual question/prompt bank for interview simulations.

No LLM: the "standard" generator composes sections out of this bank, picking
topics from the posting (title / seniority / industry) plus the chosen stage.
Everything is self-graded — the candidate reports how it went; we never store a
right/wrong verdict for open questions.
"""
from typing import Dict, List, Optional

# ---- topic catalog (key -> bilingual label). Order matters for the UI. ----
TOPICS: List[Dict[str, str]] = [
    {"key": "screening_general", "es": "Screening general", "en": "General screening"},
    {"key": "motivation", "es": "Motivación / fit", "en": "Motivation / fit"},
    {"key": "behavioral", "es": "Comportamiento / liderazgo", "en": "Behavioral / leadership"},
    {"key": "android", "es": "Android", "en": "Android"},
    {"key": "kotlin", "es": "Kotlin", "en": "Kotlin"},
    {"key": "coroutines", "es": "Coroutines / async", "en": "Coroutines / async"},
    {"key": "compose", "es": "Jetpack Compose", "en": "Jetpack Compose"},
    {"key": "architecture", "es": "Arquitectura", "en": "Architecture"},
    {"key": "system_design", "es": "System design", "en": "System design"},
    {"key": "backend", "es": "Backend", "en": "Backend"},
    {"key": "frontend", "es": "Frontend / web", "en": "Frontend / web"},
    {"key": "java", "es": "Java / JVM", "en": "Java / JVM"},
    {"key": "testing", "es": "Testing", "en": "Testing"},
    {"key": "cs_fundamentals", "es": "Fundamentos CS", "en": "CS fundamentals"},
]
TOPIC_KEYS = {t["key"] for t in TOPICS}


def topic_label(key: str, lang: str) -> str:
    for t in TOPICS:
        if t["key"] == key:
            return t.get(lang) or t["en"]
    return key


# ---- theory question bank: topic -> list of {es, en} ----
QUESTIONS: Dict[str, List[Dict[str, str]]] = {
    "screening_general": [
        {"es": "Contame sobre vos y tu experiencia en 2 minutos.",
         "en": "Tell me about yourself and your experience in 2 minutes."},
        {"es": "¿Por qué estás buscando un cambio ahora?",
         "en": "Why are you looking for a change right now?"},
        {"es": "¿Qué sabés de la empresa y por qué te interesa este puesto?",
         "en": "What do you know about the company and why this role?"},
        {"es": "¿Cuáles son tus expectativas salariales?",
         "en": "What are your salary expectations?"},
        {"es": "¿Cuál es tu disponibilidad y preferencia de modalidad (remoto/híbrido)?",
         "en": "What's your availability and work-mode preference (remote/hybrid)?"},
        {"es": "¿Tenés otros procesos activos? ¿En qué etapa?",
         "en": "Do you have other processes going? At what stage?"},
    ],
    "motivation": [
        {"es": "¿Qué te motiva en el día a día de tu trabajo?",
         "en": "What motivates you day to day at work?"},
        {"es": "¿Cómo se ve tu próximo paso de carrera en 2-3 años?",
         "en": "What does your next career step look like in 2-3 years?"},
        {"es": "¿Qué buscás en un equipo y en un manager?",
         "en": "What do you look for in a team and in a manager?"},
        {"es": "¿Qué te haría rechazar una oferta que en papel se ve bien?",
         "en": "What would make you turn down an offer that looks good on paper?"},
    ],
    "behavioral": [
        {"es": "Contame un conflicto con un compañero y cómo lo resolviste (STAR).",
         "en": "Tell me about a conflict with a teammate and how you solved it (STAR)."},
        {"es": "Un proyecto que se te fue de plazo: ¿qué pasó y qué aprendiste?",
         "en": "A project that slipped its deadline: what happened and what did you learn?"},
        {"es": "¿Cómo diste feedback difícil a alguien de tu equipo?",
         "en": "How did you give tough feedback to someone on your team?"},
        {"es": "Contame una decisión técnica que tomaste sin consenso y cómo la defendiste.",
         "en": "Tell me about a technical decision you made without consensus and how you defended it."},
        {"es": "¿Cómo priorizás cuando todo es urgente y te falta gente?",
         "en": "How do you prioritize when everything is urgent and you're short-staffed?"},
        {"es": "Un error tuyo que costó caro: ¿qué hiciste después?",
         "en": "A mistake of yours that was costly: what did you do afterwards?"},
    ],
    "android": [
        {"es": "Explicá el ciclo de vida de una Activity y de un Fragment. ¿Dónde se rompe?",
         "en": "Explain the Activity and Fragment lifecycle. Where does it break?"},
        {"es": "¿Qué es un ViewModel y cómo sobrevive a un cambio de configuración?",
         "en": "What is a ViewModel and how does it survive a configuration change?"},
        {"es": "Diferencia entre onSaveInstanceState, SavedStateHandle y persistencia en disco.",
         "en": "Difference between onSaveInstanceState, SavedStateHandle and disk persistence."},
        {"es": "¿Cómo evitás memory leaks con Context en Android?",
         "en": "How do you avoid Context memory leaks in Android?"},
        {"es": "Explicá WorkManager vs. servicios/foreground services. ¿Cuándo cada uno?",
         "en": "Explain WorkManager vs. services/foreground services. When each?"},
        {"es": "¿Cómo manejás procesos que el sistema mata en background (process death)?",
         "en": "How do you handle process death when the system kills your app in background?"},
    ],
    "kotlin": [
        {"es": "Diferencia entre val/var, y entre lista mutable e inmutable.",
         "en": "Difference between val/var, and mutable vs immutable list."},
        {"es": "¿Qué son las funciones de extensión y cuándo NO usarlas?",
         "en": "What are extension functions and when NOT to use them?"},
        {"es": "Explicá null-safety: ?., ?:, !!, y por qué !! es peligroso.",
         "en": "Explain null-safety: ?., ?:, !!, and why !! is dangerous."},
        {"es": "sealed class vs enum vs interface: ¿cuándo cada uno?",
         "en": "sealed class vs enum vs interface: when each?"},
        {"es": "¿Qué es una data class y qué genera? ¿Qué problema tiene copy() con herencia?",
         "en": "What is a data class and what does it generate? What's the copy() + inheritance problem?"},
        {"es": "inline / reified: ¿qué resuelven y cuál es el costo?",
         "en": "inline / reified: what do they solve and what's the cost?"},
    ],
    "coroutines": [
        {"es": "Diferencia entre launch y async. ¿Qué devuelve cada uno?",
         "en": "Difference between launch and async. What does each return?"},
        {"es": "Explicá structured concurrency y qué pasa cuando falla un hijo.",
         "en": "Explain structured concurrency and what happens when a child fails."},
        {"es": "¿Qué es un CoroutineScope y por qué importa el scope del ViewModel?",
         "en": "What is a CoroutineScope and why does the ViewModel scope matter?"},
        {"es": "Dispatchers.Main vs IO vs Default: ¿cuándo cada uno?",
         "en": "Dispatchers.Main vs IO vs Default: when each?"},
        {"es": "Flow vs StateFlow vs SharedFlow: diferencias y cuándo usar cada uno.",
         "en": "Flow vs StateFlow vs SharedFlow: differences and when to use each."},
        {"es": "¿Cómo cancelás una corrutina y qué es la cooperación con la cancelación?",
         "en": "How do you cancel a coroutine and what is cancellation cooperation?"},
    ],
    "compose": [
        {"es": "¿Qué es recomposición y qué la dispara?",
         "en": "What is recomposition and what triggers it?"},
        {"es": "remember vs rememberSaveable vs state hoisting.",
         "en": "remember vs rememberSaveable vs state hoisting."},
        {"es": "¿Qué es estabilidad/skippability y cómo afecta la performance?",
         "en": "What is stability/skippability and how does it affect performance?"},
        {"es": "LaunchedEffect, DisposableEffect, derivedStateOf: ¿para qué cada uno?",
         "en": "LaunchedEffect, DisposableEffect, derivedStateOf: what's each for?"},
        {"es": "¿Cómo listás miles de items de forma performante?",
         "en": "How do you render thousands of list items performantly?"},
    ],
    "architecture": [
        {"es": "Explicá MVVM / MVI y el flujo unidireccional de datos.",
         "en": "Explain MVVM / MVI and unidirectional data flow."},
        {"es": "¿Cómo separás capas (data/domain/ui) y qué gana el proyecto con eso?",
         "en": "How do you split layers (data/domain/ui) and what does the project gain?"},
        {"es": "¿Cuándo introducís use cases y cuándo son overkill?",
         "en": "When do you introduce use cases and when are they overkill?"},
        {"es": "Repository pattern y single source of truth con caché offline.",
         "en": "Repository pattern and single source of truth with offline cache."},
        {"es": "¿Cómo modularizás una app grande y cómo evitás ciclos entre módulos?",
         "en": "How do you modularize a large app and avoid cycles between modules?"},
    ],
    "system_design": [
        {"es": "Diseñá el feed de una app tipo Instagram: entidades, caché, paginado.",
         "en": "Design an Instagram-style feed: entities, cache, pagination."},
        {"es": "¿Cómo diseñás sync offline-first con resolución de conflictos?",
         "en": "How do you design offline-first sync with conflict resolution?"},
        {"es": "Rate limiting y reintentos con backoff: ¿cómo lo implementás en cliente?",
         "en": "Rate limiting and retries with backoff: how do you implement it client-side?"},
        {"es": "¿Cómo escalarías las notificaciones push para 10M de usuarios?",
         "en": "How would you scale push notifications to 10M users?"},
    ],
    "backend": [
        {"es": "REST vs gRPC vs GraphQL: trade-offs y cuándo cada uno.",
         "en": "REST vs gRPC vs GraphQL: trade-offs and when each."},
        {"es": "¿Cómo diseñás índices en una tabla con lecturas y escrituras intensas?",
         "en": "How do you design indexes on a read- and write-heavy table?"},
        {"es": "Idempotencia en APIs: ¿por qué importa y cómo la garantizás?",
         "en": "Idempotency in APIs: why does it matter and how do you guarantee it?"},
        {"es": "Transacciones y niveles de aislamiento: ¿qué es un phantom read?",
         "en": "Transactions and isolation levels: what is a phantom read?"},
        {"es": "¿Cómo manejás consistencia eventual entre servicios?",
         "en": "How do you handle eventual consistency across services?"},
    ],
    "frontend": [
        {"es": "Reconciliación / virtual DOM: ¿qué causa re-renders innecesarios?",
         "en": "Reconciliation / virtual DOM: what causes unnecessary re-renders?"},
        {"es": "¿Cómo optimizás el tiempo de carga inicial de una SPA?",
         "en": "How do you optimize a SPA's initial load time?"},
        {"es": "Manejo de estado: local vs global vs servidor (cache). ¿Cuándo cada uno?",
         "en": "State management: local vs global vs server (cache). When each?"},
        {"es": "Accesibilidad: ¿qué es lo mínimo que no puede faltar?",
         "en": "Accessibility: what's the bare minimum you can't skip?"},
    ],
    "java": [
        {"es": "equals/hashCode: contrato y qué pasa si lo rompés en un HashMap.",
         "en": "equals/hashCode: the contract and what breaks in a HashMap if you violate it."},
        {"es": "Diferencia entre checked y unchecked exceptions.",
         "en": "Difference between checked and unchecked exceptions."},
        {"es": "¿Qué hace el garbage collector y qué es una memory leak en la JVM?",
         "en": "What does the garbage collector do and what is a JVM memory leak?"},
        {"es": "final, static, y el modelo de memoria: visibilidad entre hilos.",
         "en": "final, static, and the memory model: visibility across threads."},
    ],
    "testing": [
        {"es": "Pirámide de testing: unit / integration / e2e. ¿Qué proporción buscás?",
         "en": "Testing pyramid: unit / integration / e2e. What ratio do you aim for?"},
        {"es": "Fakes vs mocks: ¿cuándo preferís cada uno y por qué?",
         "en": "Fakes vs mocks: when do you prefer each and why?"},
        {"es": "¿Cómo testeás código asíncrono (coroutines/flows) de forma determinística?",
         "en": "How do you test async code (coroutines/flows) deterministically?"},
        {"es": "¿Qué hace que un test sea flaky y cómo lo cazás?",
         "en": "What makes a test flaky and how do you hunt it down?"},
    ],
    "cs_fundamentals": [
        {"es": "Big-O de buscar/insertar en array, lista enlazada, hashmap y árbol balanceado.",
         "en": "Big-O of search/insert in array, linked list, hashmap and balanced tree."},
        {"es": "¿Cuándo un hashmap degrada a O(n)? ¿Cómo lo evita el lenguaje?",
         "en": "When does a hashmap degrade to O(n)? How does the language avoid it?"},
        {"es": "Recursión vs iteración: costo de stack y cuándo importa.",
         "en": "Recursion vs iteration: stack cost and when it matters."},
        {"es": "Explicá concurrencia vs paralelismo con un ejemplo.",
         "en": "Explain concurrency vs parallelism with an example."},
    ],
}

# ---- live-coding prompts: topic -> list of {es, en} ----
# No embedded IDE: only the statement. The candidate self-reports the outcome.
LIVE_CODING: Dict[str, List[Dict[str, str]]] = {
    "cs_fundamentals": [
        {"es": "Dado un array de enteros, devolvé los índices de los dos números que suman un target (two-sum). Buscá O(n).",
         "en": "Given an array of ints, return the indices of the two numbers that add up to a target (two-sum). Aim for O(n)."},
        {"es": "Detectá si una lista enlazada tiene un ciclo, sin memoria extra.",
         "en": "Detect whether a linked list has a cycle, using no extra memory."},
        {"es": "Implementá un LRU cache con get/put en O(1).",
         "en": "Implement an LRU cache with O(1) get/put."},
        {"es": "Dado un string, encontrá la subcadena más larga sin caracteres repetidos.",
         "en": "Given a string, find the longest substring without repeating characters."},
    ],
    "android": [
        {"es": "Implementá un debouncer para un buscador que no dispare la API en cada tecla.",
         "en": "Implement a debouncer for a search box that doesn't hit the API on every keystroke."},
        {"es": "Escribí un repositorio que exponga un Flow con caché en memoria + red, single source of truth.",
         "en": "Write a repository exposing a Flow with in-memory cache + network, single source of truth."},
    ],
    "kotlin": [
        {"es": "Implementá una función retry(times, delay) { } genérica con corrutinas.",
         "en": "Implement a generic retry(times, delay) { } function with coroutines."},
        {"es": "Agrupá una lista de transacciones por mes y sumá los montos, en idiomatic Kotlin.",
         "en": "Group a list of transactions by month and sum the amounts, in idiomatic Kotlin."},
    ],
    "backend": [
        {"es": "Diseñá el endpoint y el esquema para un acortador de URLs. Enunciá supuestos.",
         "en": "Design the endpoint and schema for a URL shortener. State your assumptions."},
        {"es": "Implementá rate limiting con token bucket (pseudo-código o el lenguaje que quieras).",
         "en": "Implement rate limiting with a token bucket (pseudo-code or any language)."},
    ],
    "frontend": [
        {"es": "Implementá un componente de paginación infinita que cargue al hacer scroll.",
         "en": "Implement an infinite-scroll pagination component that loads on scroll."},
    ],
}


def _q_section(topic: str, lang: str, minutes: int, count: int = 5) -> Optional[Dict]:
    qs = QUESTIONS.get(topic)
    if not qs:
        return None
    picked = qs[:count]
    return {
        "title": topic_label(topic, lang),
        "kind": "theory",
        "topic": topic,
        "duration_seconds": minutes * 60,
        "prompt": None,
        "questions": [{"q": (q.get(lang) or q["en"]), "a": None} for q in picked],
    }


def _live_section(topic: str, lang: str, minutes: int) -> Optional[Dict]:
    prompts = LIVE_CODING.get(topic) or LIVE_CODING.get("cs_fundamentals")
    if not prompts:
        return None
    p = prompts[0]
    return {
        "title": ("Live coding — " + topic_label(topic, lang)),
        "kind": "live_coding",
        "topic": topic,
        "duration_seconds": minutes * 60,
        "prompt": (p.get(lang) or p["en"]),
        "questions": [],
    }


def _open_section(topic: str, title_es: str, title_en: str, lang: str, minutes: int, count: int = 4) -> Dict:
    qs = QUESTIONS.get(topic, [])[:count]
    return {
        "title": title_es if lang == "es" else title_en,
        "kind": "open",
        "topic": topic,
        "duration_seconds": minutes * 60,
        "prompt": None,
        "questions": [{"q": (q.get(lang) or q["en"]), "a": None} for q in qs],
    }


# ---- infer technical topics from a posting (title / seniority / industry) ----
KEYWORD_TOPICS = {
    "android": "android",
    "kotlin": "kotlin",
    "compose": "compose",
    "coroutine": "coroutines",
    "java": "java",
    "backend": "backend",
    "back-end": "backend",
    "back end": "backend",
    "api": "backend",
    "server": "backend",
    "node": "backend",
    "python": "backend",
    "go ": "backend",
    "golang": "backend",
    "frontend": "frontend",
    "front-end": "frontend",
    "front end": "frontend",
    "react": "frontend",
    "angular": "frontend",
    "vue": "frontend",
    "web": "frontend",
    "ios": "cs_fundamentals",
    "architect": "architecture",
    "staff": "system_design",
    "principal": "system_design",
    "distributed": "system_design",
}

SENIOR_HINTS = ("senior", "staff", "principal", "lead", "sr", "iv", "iii")


def infer_topics(title: Optional[str], seniority: Optional[str], industry: Optional[str]) -> List[str]:
    hay = " ".join([title or "", seniority or "", industry or ""]).lower()
    found: List[str] = []
    for kw, topic in KEYWORD_TOPICS.items():
        if kw in hay and topic not in found:
            found.append(topic)
    if not found:
        found = ["cs_fundamentals"]
    return found


def is_senior(title: Optional[str], seniority: Optional[str]) -> bool:
    hay = " ".join([title or "", seniority or ""]).lower()
    return any(h in hay for h in SENIOR_HINTS)


def generate_sections(stage: str, topics: List[str], lang: str, senior: bool) -> List[Dict]:
    """Compose a 'standard' set of sections for the given stage."""
    lang = "es" if lang == "es" else "en"
    topics = [t for t in topics if t in TOPIC_KEYS] or ["cs_fundamentals"]
    sections: List[Dict] = []

    if stage == "screening":
        sections.append(_q_section("screening_general", lang, 12, count=6))
        sections.append(_open_section("motivation",
                                      "Motivación y fit", "Motivation & fit", lang, 8))

    elif stage == "management":
        sections.append(_open_section("behavioral",
                                      "Comportamiento (STAR)", "Behavioral (STAR)", lang, 20, count=5))
        sections.append(_open_section("motivation",
                                      "Carrera y liderazgo", "Career & leadership", lang, 10))
        if senior:
            sections.append(_open_section("architecture",
                                          "Decisiones técnicas", "Technical decisions", lang, 10, count=3))

    elif stage == "technical":
        tech = [t for t in topics if t not in ("screening_general", "motivation", "behavioral")]
        tech = tech or ["cs_fundamentals"]
        for topic in tech[:3]:
            s = _q_section(topic, lang, 12)
            if s:
                sections.append(s)
        live = _live_section(tech[0], lang, 30)
        if live:
            sections.append(live)
        if senior:
            sections.append(_open_section("system_design",
                                          "System design", "System design", lang, 30, count=3))

    else:  # mixed
        sections.append(_q_section("screening_general", lang, 8, count=4))
        for topic in [t for t in topics if t != "screening_general"][:2]:
            s = _q_section(topic, lang, 12)
            if s:
                sections.append(s)
        sections.append(_open_section("behavioral",
                                      "Comportamiento", "Behavioral", lang, 12, count=3))

    # Filter out any None that slipped through and give stable fallback.
    sections = [s for s in sections if s]
    if not sections:
        sections.append(_q_section("cs_fundamentals", lang, 15) or {})
    return sections
