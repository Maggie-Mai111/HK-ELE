"""Build a product-only full AI view from explicitly selected, approved static data."""
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import re


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', required=True)
    parser.add_argument('--source-root', required=True, help='Explicit approved/frozen static-data source')
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--data-version', required=True)
    parser.add_argument('--cpb-index', required=True, help='Approved CPB family-key index for this data version')
    parser.add_argument('--output', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    root, source = Path(args.data_root), Path(args.source_root)
    sha = lambda data: hashlib.sha256(data).hexdigest()
    inputs = []

    def load(relative):
        data = (root / relative).read_bytes()
        if sha(data) != sha((source / relative).read_bytes()):
            raise ValueError(f'Data differs from selected approved source: {relative}')
        inputs.append({'path': relative, 'sha256': sha(data)})
        return json.loads(gzip.decompress(data))

    manifest = load('manifest.json.gz')
    if inputs[0]['sha256'].lower() != args.manifest_sha256.lower():
        raise ValueError('The selected manifest fingerprint does not match the explicit expected fingerprint.')
    cpb_bytes = Path(args.cpb_index).read_bytes()
    cpb = json.loads(gzip.decompress(cpb_bytes) if str(args.cpb_index).endswith('.gz') else cpb_bytes)
    cpb_keys = cpb.get('cpb100_family_keys', cpb.get('cpb100FamilyKeys'))
    if not isinstance(cpb_keys, list) or any(not isinstance(key, str) for key in cpb_keys):
        raise ValueError('A separately approved CPB family-key index is required.')
    if cpb.get('sourceResultEntrySha256') not in (None, manifest['metadata']['final_candidate_result_entry_sha256']):
        raise ValueError('The CPB index belongs to another data release; regenerate its approved mappings.')
    family_fields = manifest['family_fields']
    fields = family_fields + ['browse_external_level_reference', 'browse_root', 'browse_root_meaning', 'browse_prefix', 'browse_suffix']
    records, keys, form_count = [], set(), 0

    def collect(forms, field):
        values = list(dict.fromkeys(value.strip() for form in forms for value in re.split(r'[|;,·/]+', str(form.get(field) or '')) if value.strip()))
        return ' | '.join(values) if values else None

    for index in range(manifest['detail_buckets']):
        bucket = load(f'detail/{index:03d}.json.gz')
        for key, (family_row, form_rows) in bucket.items():
            family = dict(zip(family_fields, family_row))
            if key in keys or family['baseword_key'] != key:
                raise ValueError('Duplicate or inconsistent family identity.')
            keys.add(key)
            forms = [dict(zip(manifest['form_fields'], row)) for row in form_rows]
            form_count += len(forms)
            family.update(browse_external_level_reference=family.get('external_level_reference_display') or collect(forms, 'external_level_reference'), browse_root=collect(forms, 'root'), browse_root_meaning=collect(forms, 'root_meaning'), browse_prefix=collect(forms, 'prefix'), browse_suffix=collect(forms, 'suffix'))
            records.append([family.get(field) for field in fields])
    records.sort(key=lambda row: row[0])
    core_count = sum(row[fields.index('candidate_member')] in (True, 1) for row in records)
    if len(records) != int(manifest['metadata']['family_count']) or form_count != int(manifest['metadata']['form_count']) or core_count != int(manifest['metadata']['candidate_family_count']):
        raise ValueError('Family, form or Core membership controls do not match the approved manifest.')
    if not set(cpb_keys).issubset(keys):
        raise ValueError('The CPB index contains identities absent from this release.')
    payload = {'schemaVersion': 'HK_ELE_AI_FULL_PROJECTION_V1', 'apiVersion': manifest['api_version'], 'dataVersion': args.data_version, 'sourceManifestSha256': inputs[0]['sha256'], 'sourceResultEntrySha256': manifest['metadata']['final_candidate_result_entry_sha256'], 'familyCount': len(records), 'coreFamilyCount': core_count, 'formCount': form_count, 'fields': fields, 'rows': records, 'cpb100FamilyKeys': cpb_keys}
    packed = gzip.compress(json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    output = Path(args.output)
    if output.exists():
        raise ValueError('Preserve existing versions; choose a fresh output path.')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(packed)
    report = {'schemaVersion': payload['schemaVersion'], 'dataVersion': args.data_version, 'inputFiles': inputs, 'cpbIndexSha256': sha(cpb_bytes), 'families': len(records), 'coreFamilies': core_count, 'forms': form_count, 'outputSha256': sha(packed), 'outputBytes': len(packed), 'rankingAndMembershipModified': False}
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: report[key] for key in ['families', 'coreFamilies', 'forms', 'outputSha256', 'outputBytes']}))


if __name__ == '__main__':
    main()
