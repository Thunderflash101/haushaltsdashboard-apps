"""Build the deterministic public installer for the Home Assistant calendar integration."""
import io
import zipfile
from pathlib import Path


DOMAIN='familienkueche_calendar'
BRIDGE=Path(__file__).parent/'bridge'/'custom_components'/DOMAIN
FILES=('__init__.py','google.py','config_flow.py','manifest.json','services.yaml','strings.json','translations/de.json','translations/en.json')


def bridge_package():
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',zipfile.ZIP_STORED) as archive:
        for name in FILES:
            info=zipfile.ZipInfo('custom_components/'+DOMAIN+'/'+name,date_time=(2020,1,1,0,0,0))
            # Small package: stored entries avoid zlib-version-dependent checksums.
            info.compress_type=zipfile.ZIP_STORED
            info.create_system=3
            info.create_version=20
            info.extract_version=20
            info.external_attr=0o100644<<16
            archive.writestr(info,(BRIDGE/name).read_text(encoding='utf-8').encode('utf-8'))
    return stream.getvalue()
