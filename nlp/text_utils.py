import re
from typing import List

MAX_INPUT_CHARS = 16000
SENTENCE_END_RE = re.compile(r"[.!?。！？]+")
TRAILING_INCOMPLETE_RE = re.compile(
    r"\b(and|or|but|because|so|to|with|of|in|for|at|by|from)\s*$",
    re.IGNORECASE,
)
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?。！？])\s+", flags=re.UNICODE)


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def normalize_text(text: str) -> str:
    if text is None:
        return ""
    value = str(text)
    value = value.replace("\u00a0", " ")
    value = re.sub(r"\s+\n", "\n", value)
    value = re.sub(r"\n\s+", "\n", value)
    value = re.sub(r"[\t\r]+", " ", value)
    value = re.sub(r"\s{2,}", " ", value)
    return value.strip()


def truncate_at_boundary(text: str, max_chars: int = MAX_INPUT_CHARS) -> str:
    text = str(text or "")
    if len(text) <= max_chars:
        return text

    cut = text[:max_chars]
    matches = list(SENTENCE_END_RE.finditer(cut))
    if matches:
        last_end = matches[-1].end()
        if last_end >= int(max_chars * 0.6):
            return cut[:last_end].strip()

    last_space = cut.rfind(" ")
    if last_space >= int(max_chars * 0.6):
        return cut[:last_space].strip()

    return cut.strip()


def clean_summary_text(summary: str) -> str:
    s = normalize_whitespace(summary)
    if not s:
        return ""

    if s[-1] not in ".!?。！？":
        last_punct = max(
            s.rfind("."),
            s.rfind("!"),
            s.rfind("?"),
            s.rfind("。"),
            s.rfind("！"),
            s.rfind("？"),
        )
        if last_punct != -1 and last_punct >= int(len(s) * 0.5):
            s = s[: last_punct + 1].strip()

    s = TRAILING_INCOMPLETE_RE.sub("", s).strip()
    return s


def split_sentences(text: str) -> List[str]:
    cleaned = normalize_text(text)
    if not cleaned:
        return []
    normalized = re.sub(r"\n+", " ", cleaned)
    parts = SENTENCE_SPLIT_RE.split(normalized)
    return [part.strip() for part in parts if part.strip()]


def build_word_aware_chunks(text: str, max_words: int = 1000) -> List[str]:
    if not text:
        return []
    sentences = split_sentences(text)
    if not sentences:
        tokens = [tok for tok in normalize_text(text).split() if tok]
        if not tokens:
            return []
        return [" ".join(tokens[i : i + max_words]) for i in range(0, len(tokens), max_words)]

    chunks: List[str] = []
    current_chunk: List[str] = []
    current_count = 0

    for sentence in sentences:
        token_count = len([tok for tok in sentence.split() if tok])
        if token_count == 0:
            continue
        if current_count + token_count > max_words and current_chunk:
            chunks.append(" ".join(current_chunk))
            current_chunk = []
            current_count = 0
        current_chunk.append(sentence)
        current_count += token_count

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks
