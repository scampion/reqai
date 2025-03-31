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
    def __init__(self, identifier, description, priority, stakeholder_ids, deadline):
        self.identifier = identifier
        self.description = description
        self.priority = priority
        self.stakeholder_ids = stakeholder_ids
        self.deadline = deadline

    def __repr__(self):
        return (f"Goal(identifier={self.identifier}, description={self.description}, priority={self.priority}, "
                f"stakeholder_ids={self.stakeholder_ids}, deadline={self.deadline})")

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

class BusinessProcess:
    def __init__(self, identifier, name, description, owner_id, department, inputs):
        self.identifier = identifier
        self.name = name
        self.description = description
        self.owner_id = owner_id
        self.department = department
        self.inputs = inputs

    def __repr__(self):
        return (f"BusinessProcess(identifier={self.identifier}, name={self.name}, description={self.description}, "
                f"owner_id={self.owner_id}, department={self.department}, inputs={self.inputs})")

class BusinessProcessesModel:
    def __init__(self):
        self.business_processes = []

    def add_business_process(self, business_process):
        self.business_processes.append(business_process)

    def get_business_process(self, identifier):
        for business_process in self.business_processes:
            if business_process.identifier == identifier:
                return business_process
        return None

    def __repr__(self):
        return f"BusinessProcessesModel(business_processes={self.business_processes})"

class Requirement:
    def __init__(self, identifier, description, priority, stakeholder_ids, goal_ids, process_ids=None):
        self.identifier = identifier
        self.description = description
        self.priority = priority
        self.stakeholder_ids = stakeholder_ids
        self.goal_ids = goal_ids
        self.process_ids = process_ids if process_ids is not None else []

    def __repr__(self):
        return (f"Requirement(identifier={self.identifier}, description={self.description}, "
                f"priority={self.priority}, stakeholder_ids={self.stakeholder_ids}, goal_ids={self.goal_ids}, "
                f"process_ids={self.process_ids})")

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
