# 条目级时间戳合并 —— 与前端 assets/js/sync.js 的 mergeData/mergeArrays 语义对齐
# 冲突策略：同一 id 的条目保留时间戳（updatedAt / ts / createdAt）较大者；
# 不同 id 的条目全部保留（新增不互相删除）。
import json


def _item_key(it):
    if isinstance(it, dict):
        return it.get("id") or json.dumps(it, sort_keys=True, ensure_ascii=False)
    return str(it)


def _item_ts(it):
    if isinstance(it, dict):
        return it.get("updatedAt") or it.get("ts") or it.get("createdAt") or 0
    return 0


def merge_arrays(base, over):
    if not isinstance(base, list):
        base = []
    if not isinstance(over, list):
        over = []
    m = {}
    for it in base + over:
        k = _item_key(it)
        if k not in m:
            m[k] = it
        else:
            existing = m[k]
            m[k] = it if _item_ts(it) >= _item_ts(existing) else existing
    return list(m.values())


def merge_data(older, newer):
    if not isinstance(older, dict):
        older = {}
    if not isinstance(newer, dict):
        newer = {}
    out = dict(older)
    for k, b in newer.items():
        a = out.get(k)
        if isinstance(a, list) and isinstance(b, list):
            out[k] = merge_arrays(a, b)
        elif isinstance(a, dict) and isinstance(b, dict):
            sub = dict(a)
            for kk, vv in b.items():
                if isinstance(sub.get(kk), list) and isinstance(vv, list):
                    sub[kk] = merge_arrays(sub[kk], vv)
                else:
                    sub[kk] = vv
            out[k] = sub
        else:
            out[k] = b
    out["updatedAt"] = max(older.get("updatedAt", 0) or 0, newer.get("updatedAt", 0) or 0)
    return out
