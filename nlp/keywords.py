from collections import defaultdict
from typing import List

import regex

from .text_utils import normalize_text

TOKEN_PATTERN = regex.compile(r"[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*", flags=regex.UNICODE)

ENGLISH_STOPWORDS = {
    "the","a","an","and","or","but","if","then","else","when","while","for","to","of","in","on","at","by","from","with","as","into","about","over","under",
    "is","are","was","were","be","been","being","do","does","did","can","could","should","would","will","may","might","must",
    "this","that","these","those","it","its","they","them","their","we","you","your","i","he","she","his","her","our","us",
    "not","no","yes","more","most","less","very","also","just","than","too"
}

VIETNAMESE_STOPWORDS = {
    "và","là","của","cho","trong","với","một","những","các","để","khi","thì","từ","đến","trên","dưới","về","này","đó","đang","được","bị","có","không",
    "ở","ra","vào","như","theo","hơn","rất","cũng"
}

KEYWORD_WEIGHTS = {
    "TITLE_TERM": 60,
    "TITLE_PHRASE": 80,
    "HEADING_TERM": 40,
    "HEADING_PHRASE": 50,
    "MAIN_TERM": 10,
    "MAIN_PHRASE": 10,
    "NOISE_TERM": 3,
    "NOISE_PHRASE": 3,
}


def tokenize(text: str) -> List[str]:
    cleaned = normalize_text(text)
    if not cleaned:
        return []
    tokens = []
    for match in TOKEN_PATTERN.finditer(cleaned):
        token = match.group(0).lower()
        if len(token) < 2 or token.isdecimal():
            continue
        tokens.append(token)
    return tokens


def is_stopword(token: str) -> bool:
    return token in ENGLISH_STOPWORDS or token in VIETNAMESE_STOPWORDS


def add_weighted_terms(tokens: List[str], weight: int, counts: defaultdict):
    for token in tokens:
        if len(token) < 3 or is_stopword(token):
            continue
        counts[token] += weight


def add_weighted_phrases(tokens: List[str], weight: int, counts: defaultdict):
    words = [tok for tok in tokens if len(tok) >= 2]
    for i in range(len(words) - 1):
        first = words[i]
        second = words[i + 1]
        if is_stopword(first) or is_stopword(second):
            continue
        bi = f"{first} {second}"
        counts[bi] += weight
        if i < len(words) - 2:
            third = words[i + 2]
            if not is_stopword(third):
                tri = f"{first} {second} {third}"
                counts[tri] += weight


def count_occurrences(haystack: List[str], needle: List[str]) -> int:
    if not needle:
        return 0
    if len(needle) == 1:
        return sum(1 for token in haystack if token == needle[0])
    count = 0
    for i in range(len(haystack) - len(needle) + 1):
        if haystack[i : i + len(needle)] == needle:
            count += 1
    return count


def extract_keywords(
    text: str,
    title: str,
    headings: List[str],
    main_text: str,
    noise_text: str,
        max_keywords: int = 5,
        min_count: int = 4,
) -> List[dict]:
    counts = defaultdict(int)

    title_tokens = tokenize(title)
    add_weighted_terms(title_tokens, KEYWORD_WEIGHTS["TITLE_TERM"], counts)
    add_weighted_phrases(title_tokens, KEYWORD_WEIGHTS["TITLE_PHRASE"], counts)

    heading_text = " ".join(headings)
    heading_tokens = tokenize(heading_text)
    add_weighted_terms(heading_tokens, KEYWORD_WEIGHTS["HEADING_TERM"], counts)
    add_weighted_phrases(heading_tokens, KEYWORD_WEIGHTS["HEADING_PHRASE"], counts)

    main_tokens = tokenize(main_text or text)
    add_weighted_terms(main_tokens, KEYWORD_WEIGHTS["MAIN_TERM"], counts)
    add_weighted_phrases(main_tokens, KEYWORD_WEIGHTS["MAIN_PHRASE"], counts)

    noise_tokens = tokenize(noise_text)
    add_weighted_terms(noise_tokens, KEYWORD_WEIGHTS["NOISE_TERM"], counts)
    add_weighted_phrases(noise_tokens, KEYWORD_WEIGHTS["NOISE_PHRASE"], counts)

    results = sorted(
        counts.items(),
        key=lambda item: (
            -len(item[0].split()),
            -item[1],
            item[0],
        ),
    )

    picked = []
    for term, score in results:
        if len(picked) >= max_keywords:
            break
        if " " not in term:
            if any(" " in candidate["term"] and term in candidate["term"].split() for candidate in picked):
                continue
        picked.append({"term": term, "score": score})

    words_in_phrases = {
        word
        for entry in picked
        for word in entry["term"].split()
        if " " in entry["term"]
    }

    frequency_tokens = tokenize(
        "\n".join(
            filter(
                None,
                [title, heading_text, main_text or text, noise_text],
            )
        )
    )

    final_keywords = []
    for candidate in picked:
        term = candidate["term"]
        if " " not in term and term in words_in_phrases:
            continue
        needle_tokens = tokenize(term)
        count = count_occurrences(frequency_tokens, needle_tokens)
        if count < min_count:
            continue
        final_keywords.append({"term": term, "count": count, "score": candidate["score"]})
        if len(final_keywords) >= max_keywords:
            break

    final_keywords.sort(key=lambda item: (-item["score"], item["term"]))
    return final_keywords
