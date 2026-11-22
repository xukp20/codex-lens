"""Inspect competing quota rate models using chronological validation blocks."""
from itertools import combinations
from math import exp, log, sqrt

BASE = "gpt-6.2-sol"


def inverse(matrix):
    size = len(matrix)
    augmented = [list(row) + [float(i == j) for j in range(size)] for i, row in enumerate(matrix)]
    for i in range(size):
        pivot = max(range(i, size), key=lambda r: abs(augmented[r][i]))
        scalar = augmented[pivot][i]
        if abs(scalar) < 1e-9:
            return None
        augmented[pivot], augmented[i] = augmented[i], [x / scalar for x in augmented[pivot]]
        for j, row in enumerate(augmented):
            if j != i:
                factor = row[i]
                augmented[j] = [x - factor * y for x, y in zip(row, augmented[i])]
    return [row[size:] for row in augmented]


def feature_value(row, weights):
    result = 0.0
    for model, (uncached, cached, output) in row["components"].items():
        result += weights.get(model, 1) * (uncached + cached * weights.get("C", 1) + output * weights.get("O", 1))
    return result


def predictions(rows, names, params):
    changes = {name: exp(p) for name, p in zip(names, params[1:])}
    return [exp(params[0]) * feature_value(row, changes) for row in rows]


def fit(rows, names):
    observed = [r["delta"] for r in rows]

    def objective(values):
        weights = {name: exp(p) for name, p in zip(names, values)}
        x = [feature_value(row, weights) for row in rows]
        # The Huber slope has a monotone derivative. Profile it exactly so
        # scale and the cache / output weights do not chase each other.
        lo, hi = 0., max(y / v for v, y in zip(x, observed) if v > 0)
        for _ in range(25):
            beta = (lo + hi) / 2
            score = sum(v * max(-1., min(1., beta*v-y)) for v,y in zip(x,observed))
            if score > 0:
                hi = beta
            else:
                lo = beta
        beta = (lo + hi) / 2
        residuals = [abs(y - beta*v) for v,y in zip(x,observed)]
        loss = sum(.5*r*r if r <= 1 else r - .5 for r in residuals)
        return log(max(beta, 1e-12)), loss + .04 * sum(t*t for t in values)

    weights = [0.0] * len(names)
    beta, best = objective(weights)
    for step in (.7, .35, .17, .08, .04, .02, .01):
        for _ in range(6):
            improved = False
            for i in range(len(weights)):
                for direction in (-1, 1):
                    trial = weights.copy()
                    trial[i] += direction * step
                    if not log(.2) <= trial[i] <= log(5):
                        continue
                    scale, value = objective(trial)
                    if value < best - 1e-10:
                        weights, beta, best, improved = trial, scale, value, True
            if not improved:
                break
    return [beta, *weights]


def uncertainty(rows, names, params, residuals):
    def column(i):
        other = params.copy()
        other[i] += 1e-4
        return [(r - l) / 1e-4 for r, l in
                zip(predictions(rows, names, other), predictions(rows, names, params))]
    columns = [column(i) for i in range(len(params))]
    norms = [sqrt(sum(v*v for v in x)) for x in columns]
    if any(n < 1e-9 for n in norms):
        return None, None
    scaled = [[v/n for v in col] for col, n in zip(columns, norms)]
    gram = [[sum(a*b for a, b in zip(x, y)) for y in scaled] for x in scaled]
    covariance = inverse(gram)
    if covariance is None:
        return None, None
    noise = max(1/6, sum(r*r for r in residuals) / max(1, len(rows) - len(params)))
    # Check collinearity among dimensionless feature shares, leaving the
    # common cycle scale in the covariance calculation where it belongs.
    centered = []
    for col in columns[1:]:
        share = [v/base if base > 0 else 0. for v,base in zip(col, columns[0])]
        mean = sum(share) / len(share)
        values = [v - mean for v in share]
        norm = sqrt(sum(v*v for v in values))
        if norm < 1e-9:
            return None, None
        centered.append([v/norm for v in values])
    correlation = inverse([[sum(a*b for a,b in zip(x,y)) for y in centered] for x in centered])
    vif = max((correlation[i][i] for i in range(len(centered))), default=1.) if correlation is not None else None
    intervals = {}
    for i, label in enumerate(("cycleBudget", *names)):
        margin = min(20, 1.96 * sqrt(max(0, covariance[i][i]) * noise) / norms[i])
        p = -params[i] + log(100) if i == 0 else params[i]
        intervals[label] = {"value": exp(p), "low": exp(p-margin), "high": exp(p+margin)}
    return vif, intervals


def evaluate(rows, factors, models):
    names = models if "M" in factors else []
    names = names + [name for name in ("C", "O") if name in factors]
    label = "+".join(factors) or "Base"
    if ("M" in factors and not models) or len(rows) < len(names) + 4:
        return {"name": label, "status": "insufficient"}
    params = fit(rows, names)
    fitted = predictions(rows, names, params)
    residual = [row["delta"] - value for row, value in zip(rows, fitted)]
    vif, estimates = uncertainty(rows, names, params, residual)
    cv = []
    for block in range(3):
        a, b = len(rows)*block//3, len(rows)*(block+1)//3
        train, test = rows[:a]+rows[b:], rows[a:b]
        if len(train) <= len(names) + 1:
            continue
        pred = predictions(test, names, fit(train, names))
        cv.extend(abs(r["delta"] - p) for r, p in zip(test, pred))
    status = "candidate" if vif is not None and vif < 10 and len(cv) == len(rows) else "exploratory"
    return {"name": label, "status": status, "vif": vif,
            "holdoutMae": sum(cv)/len(cv) if cv else None, "params": estimates,
            "predicted": fitted, "observed": [row["delta"] for row in rows]}


def calibrate(segments):
    usable = [row for row in segments if row["covered"] and row.get("components") and row["usd"] > 0]
    exposures = {}
    for row in usable:
        for model, values in row["components"].items():
            exposures[model] = exposures.get(model, 0) + sum(values)
    models = [m for m in sorted(exposures, key=exposures.get, reverse=True) if m != BASE][:2] if BASE in exposures else []
    candidates = [evaluate(usable, combo, models)
                  for count in range(4) for combo in combinations(("M", "C", "O"), count)]
    base = candidates[0]
    best = base
    for row in candidates[1:]:
        if row["status"] == "candidate" and best["holdoutMae"] is not None:
            if row["holdoutMae"] < min(.93*best["holdoutMae"], best["holdoutMae"]-.05):
                best = row
    return {"recommended": best["name"], "samples": len(usable), "excluded": len(segments) - len(usable),
            "baseModel": BASE, "candidates": candidates}
