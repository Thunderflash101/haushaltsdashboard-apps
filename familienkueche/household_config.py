"""Neutral public defaults; private display names come from HA app options.

Legacy profile IDs remain stable so photos, tasks and point balances survive.
"""
PEOPLE = ('tina', 'joern', 'felix')


def profile_names(options):
    names = {'alle': 'Familie'}
    for number, person in enumerate(PEOPLE, 1):
        value = options.get('profile_name_' + str(number), 'Person ' + str(number))
        if not isinstance(value, str) or not value.strip() or len(value) > 40 or any(ord(c) < 32 for c in value):
            raise ValueError('Profilnamen müssen 1–40 Zeichen lang sein und dürfen keine Steuerzeichen enthalten.')
        names[person] = value.strip()
    return names
