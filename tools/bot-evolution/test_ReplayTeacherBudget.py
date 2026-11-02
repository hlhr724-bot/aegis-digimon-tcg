from ReplayTeacherBudget import ReplayTeacherBudget


def test_hard_restart_cannot_reset_campaign_or_stage_deadlines(tmp_path, monkeypatch):
    monkeypatch.setattr("ReplayTeacherBudget.time.time", lambda: 1000)
    first = ReplayTeacherBudget(tmp_path / "budget.json")
    teacher_deadline = first.get_deadline("teacher", 8)
    monkeypatch.setattr("ReplayTeacherBudget.time.time", lambda: 2000)
    resumed = ReplayTeacherBudget(tmp_path / "budget.json")
    assert resumed.state["deadline"] == 87400
    assert resumed.get_deadline("teacher", 8) == teacher_deadline
    assert resumed.get_deadline("confirmation", 8) == 30800


def test_stage_deadline_cannot_exceed_global_budget(tmp_path, monkeypatch):
    monkeypatch.setattr("ReplayTeacherBudget.time.time", lambda: 1000)
    budget = ReplayTeacherBudget(tmp_path / "budget.json")
    monkeypatch.setattr("ReplayTeacherBudget.time.time", lambda: 87000)
    assert budget.get_deadline("teacher", 8) == 87400
