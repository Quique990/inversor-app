"""Genera datos de DEMOSTRACIÓN en web/data/ para ver la web antes de la primera ejecución real.

La primera ejecución del workflow diario los sobrescribe. Uso: python scripts/generar_demo.py
"""
import json
import sys
from pathlib import Path

from _pytest.monkeypatch import MonkeyPatch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import pipeline.main as main  # noqa: E402
from tests.test_main_offline import instalar_simulacion  # noqa: E402

mp = MonkeyPatch()
instalar_simulacion(mp)
main.ejecutar()
mp.undo()
ruta = main.WEB_DATA / "mercado.json"
d = json.loads(ruta.read_text(encoding="utf-8"))
d["demo"] = True
d["resumen"] = "DATOS DE DEMOSTRACIÓN (simulados). " + d["resumen"]
ruta.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
print("Demo generada en", main.WEB_DATA)
