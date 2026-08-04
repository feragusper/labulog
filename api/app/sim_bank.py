"""Static, bilingual question/prompt bank for interview simulations.

No LLM: the "standard" generator composes sections out of this bank, picking
topics from the posting (title / seniority / industry), the chosen stage, and a
region (Argentina / Europe / global) that flavors the non-technical rounds.

Technical questions are sourced from public 2025-2026 Android/Kotlin interview
question sets; the region rounds encode how Android hiring actually differs:
Argentina (remote-for-USD, English screening, contractor vs relación de
dependencia, US timezone overlap) and Europe (visa sponsorship / EU Blue Card,
relocation, notice period, languages). See the commit for source links.

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
    {"key": "coroutines", "es": "Coroutines / Flow", "en": "Coroutines / Flow"},
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

# ---- regions (key -> bilingual label). Flavor the non-technical rounds. ----
REGIONS: List[Dict[str, str]] = [
    {"key": "global", "es": "Global", "en": "Global"},
    {"key": "ar", "es": "Argentina", "en": "Argentina"},
    {"key": "eu", "es": "Europa", "en": "Europe"},
]
REGION_KEYS = {r["key"] for r in REGIONS}


def topic_label(key: str, lang: str) -> str:
    for t in TOPICS:
        if t["key"] == key:
            return t.get(lang) or t["en"]
    return key


# ---- theory question bank: topic -> list of {es, en} ----
QUESTIONS: Dict[str, List[Dict[str, str]]] = {
    "screening_general": [
        {"es": "Contame sobre vos y tu experiencia en Android en 2 minutos.",
         "en": "Tell me about yourself and your Android experience in 2 minutes."},
        {"es": "¿Por qué estás buscando un cambio ahora?",
         "en": "Why are you looking for a change right now?"},
        {"es": "¿Qué sabés de la empresa y por qué te interesa este puesto?",
         "en": "What do you know about the company and why this role?"},
        {"es": "¿Cuáles son tus expectativas salariales?",
         "en": "What are your salary expectations?"},
        {"es": "¿Cuál es tu disponibilidad y preferencia de modalidad (remoto/híbrido/onsite)?",
         "en": "What's your availability and work-mode preference (remote/hybrid/onsite)?"},
        {"es": "¿Tenés otros procesos activos? ¿En qué etapa?",
         "en": "Do you have other processes going? At what stage?"},
    ],
    "motivation": [
        {"es": "¿Qué te motiva en el día a día de tu trabajo como dev Android?",
         "en": "What motivates you day to day as an Android dev?"},
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
        {"es": "Un bug de producción crítico que rompiste vos: ¿qué hiciste después?",
         "en": "A critical production bug you caused: what did you do afterwards?"},
        {"es": "¿Cómo mentoreás a un dev junior en Android?",
         "en": "How do you mentor a junior Android dev?"},
    ],
    "android": [
        {"es": "Diferencia entre Activity y Fragment. Explicá el ciclo de vida y por qué importa onSaveInstanceState().",
         "en": "Difference between Activity and Fragment. Explain the lifecycle and why onSaveInstanceState() matters."},
        {"es": "¿Cuál es el scope de vida de un ViewModel y cómo sobrevive a un cambio de configuración?",
         "en": "What's a ViewModel's lifecycle scope and how does it survive a configuration change?"},
        {"es": "¿Cómo evitás memory leaks al trabajar con Fragments y Context?",
         "en": "How do you avoid memory leaks when working with Fragments and Context?"},
        {"es": "Intent explícito vs implícito: ¿cuándo cada uno y qué riesgos tiene el implícito?",
         "en": "Explicit vs implicit Intent: when each, and what are the risks of implicit ones?"},
        {"es": "¿Qué aporta el Navigation Component al manejo de Fragments?",
         "en": "What does the Navigation Component add to fragment management?"},
        {"es": "SavedStateHandle vs onSaveInstanceState vs persistencia en disco: ¿cuándo cada uno?",
         "en": "SavedStateHandle vs onSaveInstanceState vs disk persistence: when each?"},
        {"es": "Process death: ¿cómo manejás que el sistema mate tu app en background y restaure estado?",
         "en": "Process death: how do you handle the system killing your app in background and restore state?"},
        {"es": "WorkManager vs foreground service: ¿cuándo usar cada uno?",
         "en": "WorkManager vs foreground service: when to use each?"},
        {"es": "¿Por qué findViewById está desaconsejado y qué usás en su lugar (ViewBinding)?",
         "en": "Why is findViewById discouraged and what do you use instead (ViewBinding)?"},
        {"es": "¿Qué hace @Parcelize y qué problema resuelve al pasar objetos entre componentes?",
         "en": "What does @Parcelize do and what problem does it solve when passing objects between components?"},
    ],
    "kotlin": [
        {"es": "val vs var, y lista mutable vs inmutable: ¿cuándo preferís cada uno?",
         "en": "val vs var, and mutable vs immutable list: when do you prefer each?"},
        {"es": "¿Qué hace el operador !! y por qué es peligroso? Explicá null-safety con ?. y ?:.",
         "en": "What does the !! operator do and why is it dangerous? Explain null-safety with ?. and ?:."},
        {"es": "lateinit vs by lazy: diferencias y cuándo usar cada uno.",
         "en": "lateinit vs by lazy: differences and when to use each."},
        {"es": "¿Qué genera una data class? ¿Puede heredar de otra clase y qué problema tiene copy()?",
         "en": "What does a data class generate? Can it inherit from another class and what's the copy() catch?"},
        {"es": "sealed class vs enum vs sealed interface: ¿cuándo cada uno?",
         "en": "sealed class vs enum vs sealed interface: when each?"},
        {"es": "¿Para qué sirve companion object? ¿Qué hacen @JvmStatic y @JvmOverloads en interop con Java?",
         "en": "What is companion object for? What do @JvmStatic and @JvmOverloads do for Java interop?"},
        {"es": "inline y reified: ¿qué resuelven y cuál es el costo?",
         "en": "inline and reified: what do they solve and what's the cost?"},
        {"es": "value/inline class vs data class: ¿en qué se diferencian y para qué usarlas?",
         "en": "value/inline class vs data class: how do they differ and what are they for?"},
        {"es": "let / run / apply / also: diferencias y un caso de uso de cada uno.",
         "en": "let / run / apply / also: differences and a use case for each."},
        {"es": "Funciones de extensión: para qué sirven y cómo se pueden usar mal.",
         "en": "Extension functions: what they're for and how they can be misused."},
    ],
    "coroutines": [
        {"es": "launch vs async: ¿qué devuelve cada uno y cuándo usás cada uno?",
         "en": "launch vs async: what does each return and when do you use each?"},
        {"es": "Explicá structured concurrency y qué pasa cuando falla una corrutina hija.",
         "en": "Explain structured concurrency and what happens when a child coroutine fails."},
        {"es": "CoroutineScope vs lifecycleScope vs viewModelScope: ¿en qué se diferencian?",
         "en": "CoroutineScope vs lifecycleScope vs viewModelScope: how do they differ?"},
        {"es": "coroutineScope vs supervisorScope: ¿cómo cambia la propagación de errores?",
         "en": "coroutineScope vs supervisorScope: how does error propagation change?"},
        {"es": "Dispatchers.Main vs IO vs Default: ¿cuándo cada uno?",
         "en": "Dispatchers.Main vs IO vs Default: when each?"},
        {"es": "¿Qué rol cumple el modificador suspend y cómo se compila por debajo?",
         "en": "What role does the suspend modifier play and how does it compile under the hood?"},
        {"es": "¿Cómo cancelás una corrutina y qué es la cancelación cooperativa?",
         "en": "How do you cancel a coroutine and what is cooperative cancellation?"},
        {"es": "Flow vs StateFlow vs SharedFlow: diferencias y cuándo usar cada uno.",
         "en": "Flow vs StateFlow vs SharedFlow: differences and when to use each."},
        {"es": "Cold flow vs hot flow: explicá con un ejemplo real de cada uno.",
         "en": "Cold flow vs hot flow: explain with a real example of each."},
        {"es": "collectLatest vs collect, y cómo implementarías retry con backoff exponencial sobre un Flow.",
         "en": "collectLatest vs collect, and how would you implement exponential-backoff retry over a Flow."},
    ],
    "compose": [
        {"es": "¿En qué se diferencia Compose (declarativo) del sistema de Views (imperativo)?",
         "en": "How is Compose (declarative) different from the View system (imperative)?"},
        {"es": "¿Qué es recomposición y qué la dispara exactamente?",
         "en": "What is recomposition and what exactly triggers it?"},
        {"es": "remember vs rememberSaveable vs state hoisting: ¿cuándo cada uno?",
         "en": "remember vs rememberSaveable vs state hoisting: when each?"},
        {"es": "Estabilidad / skippability y la anotación @Stable: ¿cómo afectan la performance?",
         "en": "Stability / skippability and the @Stable annotation: how do they affect performance?"},
        {"es": "LaunchedEffect, DisposableEffect y rememberCoroutineScope: ¿para qué cada uno? ¿por qué importan las keys?",
         "en": "LaunchedEffect, DisposableEffect and rememberCoroutineScope: what's each for? why do keys matter?"},
        {"es": "derivedStateOf: ¿cuándo conviene y cuándo es overhead?",
         "en": "derivedStateOf: when is it worth it and when is it overhead?"},
        {"es": "¿Para qué sirve snapshotFlow y cómo lo usarías?",
         "en": "What is snapshotFlow for and how would you use it?"},
        {"es": "¿Por qué son importantes las keys en LazyColumn/LazyRow y cómo listás miles de items sin jank?",
         "en": "Why are keys important in LazyColumn/LazyRow and how do you render thousands of items without jank?"},
        {"es": "collectAsStateWithLifecycle vs collectAsState: ¿por qué preferir el primero?",
         "en": "collectAsStateWithLifecycle vs collectAsState: why prefer the former?"},
        {"es": "Un screen recompone de más: ¿cómo lo diagnosticás y lo arreglás?",
         "en": "A screen recomposes too often: how do you diagnose and fix it?"},
    ],
    "architecture": [
        {"es": "MVVM vs MVI y el flujo unidireccional de datos (UDF): ¿qué gana el equipo con MVI?",
         "en": "MVVM vs MVI and unidirectional data flow (UDF): what does the team gain with MVI?"},
        {"es": "¿Cómo separás capas data/domain/ui y qué responsabilidad tiene cada una?",
         "en": "How do you split data/domain/ui layers and what's each one's responsibility?"},
        {"es": "¿Cuándo introducís use cases y cuándo son overkill?",
         "en": "When do you introduce use cases and when are they overkill?"},
        {"es": "Repository pattern y single source of truth con caché offline: ¿cómo lo diseñás?",
         "en": "Repository pattern and single source of truth with offline cache: how do you design it?"},
        {"es": "¿Cómo modularizás una app grande (feature/core) y cómo evitás ciclos entre módulos?",
         "en": "How do you modularize a large app (feature/core) and avoid cycles between modules?"},
        {"es": "Hilt: rol de @Singleton, @ActivityScoped y @ViewModelScoped, y cómo inyectás en un ViewModel.",
         "en": "Hilt: role of @Singleton, @ActivityScoped and @ViewModelScoped, and how you inject into a ViewModel."},
    ],
    "system_design": [
        {"es": "Diseñá el feed de una app tipo Instagram: entidades, caché, paginado (Paging 3).",
         "en": "Design an Instagram-style feed: entities, cache, pagination (Paging 3)."},
        {"es": "¿Cómo diseñás sync offline-first con resolución de conflictos?",
         "en": "How do you design offline-first sync with conflict resolution?"},
        {"es": "Diseñá el pipeline de carga y caché de imágenes de una app con feed pesado.",
         "en": "Design the image loading and caching pipeline for an app with a heavy feed."},
        {"es": "Rate limiting y reintentos con backoff en el cliente: ¿cómo lo implementás?",
         "en": "Rate limiting and retries with backoff on the client: how do you implement it?"},
        {"es": "¿Cómo escalarías las notificaciones push para 10M de usuarios?",
         "en": "How would you scale push notifications to 10M users?"},
        {"es": "Diseñá un sistema de analytics/tracking consistente a través de múltiples módulos.",
         "en": "Design a consistent analytics/tracking system across multiple modules."},
    ],
    "backend": [
        {"es": "REST vs gRPC vs GraphQL: trade-offs y cuándo cada uno para el backend de una app móvil.",
         "en": "REST vs gRPC vs GraphQL: trade-offs and when each for a mobile app backend."},
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
        {"es": "equals/hashCode: contrato y qué se rompe en un HashMap si lo violás.",
         "en": "equals/hashCode: the contract and what breaks in a HashMap if you violate it."},
        {"es": "Diferencia entre checked y unchecked exceptions.",
         "en": "Difference between checked and unchecked exceptions."},
        {"es": "¿Qué hace el garbage collector y qué es una memory leak en la JVM/Android?",
         "en": "What does the garbage collector do and what is a JVM/Android memory leak?"},
        {"es": "final, static y el modelo de memoria: visibilidad entre hilos.",
         "en": "final, static and the memory model: visibility across threads."},
    ],
    "testing": [
        {"es": "¿Cómo testeás un ViewModel que usa corrutinas (test dispatcher / runTest)?",
         "en": "How do you test a ViewModel that uses coroutines (test dispatcher / runTest)?"},
        {"es": "¿Cómo validás las transiciones de UiState expuestas como StateFlow (Turbine)?",
         "en": "How do you validate UiState transitions exposed as StateFlow (Turbine)?"},
        {"es": "¿Cómo testeás Flows asíncronos de forma determinística en un entorno multi-hilo?",
         "en": "How do you test async Flows deterministically in a multi-threaded environment?"},
        {"es": "Fakes vs mocks: ¿cuándo preferís cada uno y por qué?",
         "en": "Fakes vs mocks: when do you prefer each and why?"},
        {"es": "¿Qué hace que un test sea flaky y cómo lo cazás?",
         "en": "What makes a test flaky and how do you hunt it down?"},
        {"es": "Pirámide de testing: unit / integration / e2e. ¿Qué proporción buscás en Android?",
         "en": "Testing pyramid: unit / integration / e2e. What ratio do you aim for in Android?"},
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

# ---- region-specific rounds (region -> topic -> list). Fall back to QUESTIONS. ----
REGIONAL: Dict[str, Dict[str, List[Dict[str, str]]]] = {
    "ar": {
        "screening_general": [
            {"es": "Presentate y contá tu experiencia en Android en 2 minutos — en inglés, como ante un recruiter de EE.UU.",
             "en": "Introduce yourself and your Android experience in 2 minutes — in English, as before a US recruiter."},
            {"es": "¿Cuál es tu nivel de inglés (B2/C1)? ¿Te sentís cómodo en una daily y en una entrevista técnica 100% en inglés?",
             "en": "What's your English level (B2/C1)? Are you comfortable in a daily and a fully-English technical interview?"},
            {"es": "¿Buscás relación de dependencia local o contratar como contractor en USD?",
             "en": "Are you after a local employment relationship or contracting as a USD contractor?"},
            {"es": "Expectativa salarial: ¿en pesos, USD o dólar MEP? ¿Qué monto pretendés?",
             "en": "Salary expectation: in pesos, USD or MEP dollar? What amount are you after?"},
            {"es": "¿Cuántas horas de solape podés dar con el horario de EE.UU. (EST/PST)?",
             "en": "How many overlap hours can you offer with US time (EST/PST)?"},
            {"es": "¿Facturás como monotributo/responsable inscripto o necesitás blanqueo?",
             "en": "Do you invoice as a monotributista/self-employed or do you need formal local employment?"},
            {"es": "¿Tenés otros procesos activos, alguno ya en instancia de oferta?",
             "en": "Do you have other active processes, any already at offer stage?"},
        ],
        "motivation": [
            {"es": "¿Por qué te interesa trabajar para una empresa extranjera en vez de una local argentina?",
             "en": "Why do you want to work for a foreign company instead of a local Argentine one?"},
            {"es": "¿Cómo manejás la diferencia horaria y la comunicación async con un equipo distribuido?",
             "en": "How do you handle the time difference and async communication with a distributed team?"},
            {"es": "¿Qué priorizás hoy: ingreso estable en USD, crecimiento técnico o el proyecto en sí?",
             "en": "What do you prioritize today: stable USD income, technical growth, or the project itself?"},
            {"es": "¿Cómo te mantenés actualizado en Android estando lejos de los hubs tecnológicos?",
             "en": "How do you stay up to date in Android while far from the tech hubs?"},
        ],
    },
    "eu": {
        "screening_general": [
            {"es": "Contá tu experiencia en Android en 2 minutos.",
             "en": "Tell me about your Android experience in 2 minutes."},
            {"es": "¿Tenés autorización para trabajar en la UE o necesitarías sponsorship de visa (EU Blue Card)?",
             "en": "Do you hold EU work authorization, or would you need visa sponsorship (EU Blue Card)?"},
            {"es": "¿Estás abierto a relocation? ¿A qué países o ciudades?",
             "en": "Are you open to relocation? To which countries or cities?"},
            {"es": "¿Cuál es tu período de preaviso con tu empleador actual?",
             "en": "What's your notice period with your current employer?"},
            {"es": "¿Qué expectativa salarial tenés (bruto anual, en EUR)?",
             "en": "What are your salary expectations (gross annual, in EUR)?"},
            {"es": "¿Cuál es tu nivel de inglés? ¿Hablás algún otro idioma europeo (alemán, francés…)?",
             "en": "What's your English level? Do you speak any other European language (German, French…)?"},
            {"es": "¿Te acomoda híbrido/onsite o buscás estrictamente remoto?",
             "en": "Are you fine with hybrid/on-site, or strictly remote?"},
        ],
        "motivation": [
            {"es": "¿Por qué querés mudarte a este país y por qué esta empresa?",
             "en": "Why do you want to relocate to this country, and why this company?"},
            {"es": "¿Cómo trabajás en un equipo multicultural y con varios idiomas?",
             "en": "How do you work in a multicultural, multi-language team?"},
            {"es": "¿Cuáles son tus planes a largo plazo respecto de quedarte en la UE?",
             "en": "What are your long-term plans regarding staying in the EU?"},
            {"es": "¿Qué pesa más para vos: el rol, la ubicación o la compensación?",
             "en": "What matters more to you: the role, the location, or the compensation?"},
        ],
    },
}


def _region_questions(topic: str, region: str) -> List[Dict[str, str]]:
    return REGIONAL.get(region, {}).get(topic) or QUESTIONS.get(topic, [])


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
        {"es": "Implementá un buscador con debounce (300ms) sobre un Flow que no dispare la API en cada tecla.",
         "en": "Implement a search box with debounce (300ms) over a Flow that doesn't hit the API on every keystroke."},
        {"es": "Escribí un repositorio que exponga un Flow con caché en memoria + red (single source of truth) y estados loading/error/success.",
         "en": "Write a repository exposing a Flow with in-memory cache + network (single source of truth) and loading/error/success states."},
        {"es": "Dado un ViewModel, exponé un UiState inmutable como StateFlow y actualizalo ante un evento de refresh.",
         "en": "Given a ViewModel, expose an immutable UiState as StateFlow and update it on a refresh event."},
    ],
    "kotlin": [
        {"es": "Implementá una función suspend genérica retry(times, initialDelay) { } con backoff exponencial.",
         "en": "Implement a generic suspend retry(times, initialDelay) { } function with exponential backoff."},
        {"es": "Agrupá una lista de transacciones por mes y sumá los montos, en Kotlin idiomático.",
         "en": "Group a list of transactions by month and sum the amounts, in idiomatic Kotlin."},
        {"es": "Modelá el resultado de una llamada de red con una sealed class Result<Success, Error> y consumila con when.",
         "en": "Model a network call result with a sealed class Result<Success, Error> and consume it with when."},
    ],
    "compose": [
        {"es": "Implementá una lista con LazyColumn con keys estables, pull-to-refresh y un estado vacío.",
         "en": "Implement a LazyColumn list with stable keys, pull-to-refresh and an empty state."},
    ],
    "backend": [
        {"es": "Diseñá el endpoint y el esquema para un acortador de URLs. Enunciá supuestos.",
         "en": "Design the endpoint and schema for a URL shortener. State your assumptions."},
        {"es": "Implementá rate limiting con token bucket (pseudo-código o el lenguaje que quieras).",
         "en": "Implement rate limiting with a token bucket (pseudo-code or any language)."},
    ],
    "frontend": [
        {"es": "Implementá un componente de scroll infinito que cargue al llegar al final.",
         "en": "Implement an infinite-scroll component that loads when reaching the end."},
    ],
}


def _q_section(topic: str, lang: str, minutes: int, count: int = 5, region: str = "global") -> Optional[Dict]:
    qs = _region_questions(topic, region)
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


def _open_section(topic: str, title_es: str, title_en: str, lang: str, minutes: int,
                  count: int = 4, region: str = "global") -> Dict:
    qs = _region_questions(topic, region)[:count]
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
    # An Android role implies the core Kotlin stack even if not spelled out.
    if "android" in found:
        for t in ("kotlin", "coroutines", "compose", "architecture"):
            if t not in found:
                found.append(t)
    if not found:
        found = ["cs_fundamentals"]
    return found


def is_senior(title: Optional[str], seniority: Optional[str]) -> bool:
    hay = " ".join([title or "", seniority or ""]).lower()
    return any(h in hay for h in SENIOR_HINTS)


def generate_sections(stage: str, topics: List[str], lang: str, senior: bool,
                      region: str = "global") -> List[Dict]:
    """Compose a 'standard' set of sections for the given stage and region."""
    lang = "es" if lang == "es" else "en"
    region = region if region in REGION_KEYS else "global"
    topics = [t for t in topics if t in TOPIC_KEYS] or ["cs_fundamentals"]
    sections: List[Dict] = []

    if stage == "screening":
        sections.append(_q_section("screening_general", lang, 12, count=7, region=region))
        sections.append(_open_section("motivation",
                                      "Motivación y fit", "Motivation & fit", lang, 8, region=region))

    elif stage == "management":
        sections.append(_open_section("behavioral",
                                      "Comportamiento (STAR)", "Behavioral (STAR)", lang, 20, count=5))
        sections.append(_open_section("motivation",
                                      "Carrera y liderazgo", "Career & leadership", lang, 10, region=region))
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
        sections.append(_q_section("screening_general", lang, 8, count=4, region=region))
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
