from typing import Dict, List

import regex

from .text_utils import normalize_text

POSITIVE_TERMS = [
    ("good", 1),
    ("excellent", 2),
    ("amazing", 2),
    ("best", 2),
    ("love", 1),
    ("success", 2),
    ("benefit", 1),
    ("benefits", 1),
    ("improve", 1),
    ("improvement", 1),
    ("helpful", 1),
    ("tốt", 1),
    ("xuất sắc", 2),
    ("tuyệt vời", 2),
    ("thành công", 2),
    ("lợi ích", 1),
    ("hữu ích", 1),
    ("cải thiện", 1),
]

NEGATIVE_TERMS = [
    ("bad", 1),
    ("poor", 1),
    ("terrible", 2),
    ("awful", 2),
    ("worst", 2),
    ("worse", 1),
    ("fail", 1),
    ("failure", 1),
    ("harm", 2),
    ("risk", 1),
    ("danger", 2),
    ("threat", 2),
    ("threats", 2),
    ("fear", 1),
    ("fears", 1),
    ("violence", 2),
    ("violent", 2),
    ("assault", 2),
    ("attack", 2),
    ("shooting", 2),
    ("assassinated", 3),
    ("killed", 3),
    ("killing", 3),
    ("death", 3),
    ("dead", 3),
    ("racist", 3),
    ("racism", 3),
    ("sexist", 3),
    ("sexism", 3),
    ("bigot", 3),
    ("bigoted", 3),
    ("bigotry", 3),
    ("hate", 2),
    ("civil war", 2),
    ("tiêu cực", 2),
    ("tệ", 2),
    ("xấu", 1),
    ("kém", 1),
    ("thất bại", 2),
    ("rủi ro", 1),
    ("nguy hiểm", 2),
    ("bạo lực", 2),
    ("phân biệt chủng tộc", 3),
    ("kỳ thị", 2),
]


def build_phrase_pattern(term: str) -> regex.Pattern:
    parts = [regex.escape(part) for part in term.strip().split() if part]
    if not parts:
        raise ValueError("Term must contain at least one non-empty word")
    pattern = r"\b" + r"\s+".join(parts) + r"\b"
    return regex.compile(pattern, flags=regex.IGNORECASE)


def score_terms(terms: List[tuple], text: str) -> Dict[str, int]:
    score = 0
    hits = 0
    for term, weight in terms:
        try:
            pattern = build_phrase_pattern(term)
        except ValueError:
            continue
        matches = pattern.findall(text)
        if not matches:
            continue
        occurrences = len(matches)
        hits += occurrences
        score += occurrences * (weight or 1)
    return {"score": score, "hits": hits}


def detect_sentiment(text: str) -> str:
    normalized = normalize_text(text).lower()
    if not normalized:
        return "Neutral"

    positive = score_terms(POSITIVE_TERMS, normalized)
    negative = score_terms(NEGATIVE_TERMS, normalized)
    if positive["hits"] + negative["hits"] < 2:
        return "Neutral"
    overall_score = positive["score"] - negative["score"]
    if overall_score >= 3:
        return "Positive"
    if overall_score <= -3:
        return "Negative"
    return "Neutral"
