import json
import time
from pathlib import Path


class ReplayTeacherBudget:
    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self.state = (
            json.loads(path.read_text(encoding="utf-8"))
            if path.is_file()
            else {"deadline": time.time() + 86400, "stages": {}}
        )
        self._save()

    def _save(self) -> None:
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(self.state, indent=2) + "\n", encoding="utf-8")
        temporary.replace(self.path)

    def get_deadline(self, stage: str, hours: int) -> float:
        if stage not in self.state["stages"]:
            self.state["stages"][stage] = min(self.state["deadline"], time.time() + hours * 3600)
            self._save()
        return self.state["stages"][stage]
