class Stakeholder:
    def __init__(self, identifier, name, role, contact_info, department):
        self.identifier = identifier
        self.name = name
        self.role = role
        self.contact_info = contact_info
        self.department = department

    def __repr__(self):
        return (f"Stakeholder(identifier={self.identifier}, name={self.name}, role={self.role}, "
                f"contact_info={self.contact_info}, department={self.department})")

class StakeholdersModel:
    def __init__(self):
        self.stakeholders = []

    def add_stakeholder(self, stakeholder):
        self.stakeholders.append(stakeholder)

    def get_stakeholder(self, identifier):
        for stakeholder in self.stakeholders:
            if stakeholder.identifier == identifier:
                return stakeholder
        return None

    def __repr__(self):
        return f"StakeholdersModel(stakeholders={self.stakeholders})"

class Goal:
    def __init__(self, identifier, description, priority):
        self.identifier = identifier
        self.description = description
        self.priority = priority

    def __repr__(self):
        return f"Goal(identifier={self.identifier}, description={self.description}, priority={self.priority})"

class GoalsModel:
    def __init__(self):
        self.goals = []

    def add_goal(self, goal):
        self.goals.append(goal)

    def get_goal(self, identifier):
        for goal in self.goals:
            if goal.identifier == identifier:
                return goal
        return None

    def __repr__(self):
        return f"GoalsModel(goals={self.goals})"

class Requirement:
    def __init__(self, identifier, description, priority, stakeholder_ids, goal_ids):
        self.identifier = identifier
        self.description = description
        self.priority = priority
        self.stakeholder_ids = stakeholder_ids
        self.goal_ids = goal_ids

    def __repr__(self):
        return (f"Requirement(identifier={self.identifier}, description={self.description}, "
                f"priority={self.priority}, stakeholder_ids={self.stakeholder_ids}, goal_ids={self.goal_ids})")

class RequirementsModel:
    def __init__(self):
        self.requirements = []

    def add_requirement(self, requirement):
        self.requirements.append(requirement)

    def get_requirement(self, identifier):
        for requirement in self.requirements:
            if requirement.identifier == identifier:
                return requirement
        return None

    def __repr__(self):
        return f"RequirementsModel(requirements={self.requirements})"
