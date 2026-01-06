function shortHash(input, length = 6) {
    let hash = 2166136261; // FNV-1a
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash +=
            (hash << 1) +
            (hash << 4) +
            (hash << 7) +
            (hash << 8) +
            (hash << 24);
    }

    return (hash >>> 0)
        .toString(36)
        .toUpperCase()
        .substring(0, length);
}

module.exports = shortHash