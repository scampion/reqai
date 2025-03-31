class Requirement:
    def __init__(self, identifier, description, priority):
        self.identifier = identifier
        self.description = description
        self.priority = priority

    def __repr__(self):
        return f"Requirement(identifier={self.identifier}, description={self.description}, priority={self.priority})"

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
