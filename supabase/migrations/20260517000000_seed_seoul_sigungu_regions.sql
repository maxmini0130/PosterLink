DO $$
DECLARE
    seoul_id UUID;
BEGIN
    INSERT INTO regions (name, code, level, full_name)
    VALUES ('서울특별시', 'REG_SEOUL', 'sido', '서울특별시')
    ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        level = EXCLUDED.level,
        full_name = EXCLUDED.full_name,
        is_active = true;

    SELECT id INTO seoul_id FROM regions WHERE code = 'REG_SEOUL';

    INSERT INTO regions (parent_id, name, code, level, full_name) VALUES
    (seoul_id, '종로구', 'REG_SEOUL_JONGNO', 'sigungu', '서울특별시 종로구'),
    (seoul_id, '중구', 'REG_SEOUL_JUNG', 'sigungu', '서울특별시 중구'),
    (seoul_id, '용산구', 'REG_SEOUL_YONGSAN', 'sigungu', '서울특별시 용산구'),
    (seoul_id, '성동구', 'REG_SEOUL_SEONGDONG', 'sigungu', '서울특별시 성동구'),
    (seoul_id, '광진구', 'REG_SEOUL_GWANGJIN', 'sigungu', '서울특별시 광진구'),
    (seoul_id, '동대문구', 'REG_SEOUL_DONGDAEMUN', 'sigungu', '서울특별시 동대문구'),
    (seoul_id, '중랑구', 'REG_SEOUL_JUNGNANG', 'sigungu', '서울특별시 중랑구'),
    (seoul_id, '성북구', 'REG_SEOUL_SEONGBUK', 'sigungu', '서울특별시 성북구'),
    (seoul_id, '강북구', 'REG_SEOUL_GANGBUK', 'sigungu', '서울특별시 강북구'),
    (seoul_id, '도봉구', 'REG_SEOUL_DOBONG', 'sigungu', '서울특별시 도봉구'),
    (seoul_id, '노원구', 'REG_SEOUL_NOWON', 'sigungu', '서울특별시 노원구'),
    (seoul_id, '은평구', 'REG_SEOUL_EUNPYEONG', 'sigungu', '서울특별시 은평구'),
    (seoul_id, '서대문구', 'REG_SEOUL_SEODAEMUN', 'sigungu', '서울특별시 서대문구'),
    (seoul_id, '마포구', 'REG_SEOUL_MAPO', 'sigungu', '서울특별시 마포구'),
    (seoul_id, '양천구', 'REG_SEOUL_YANGCHEON', 'sigungu', '서울특별시 양천구'),
    (seoul_id, '강서구', 'REG_SEOUL_GANGSEO', 'sigungu', '서울특별시 강서구'),
    (seoul_id, '구로구', 'REG_SEOUL_GURO', 'sigungu', '서울특별시 구로구'),
    (seoul_id, '금천구', 'REG_SEOUL_GEUMCHEON', 'sigungu', '서울특별시 금천구'),
    (seoul_id, '영등포구', 'REG_SEOUL_YEONGDEUNGPO', 'sigungu', '서울특별시 영등포구'),
    (seoul_id, '동작구', 'REG_SEOUL_DONGJAK', 'sigungu', '서울특별시 동작구'),
    (seoul_id, '관악구', 'REG_SEOUL_GWANAK', 'sigungu', '서울특별시 관악구'),
    (seoul_id, '서초구', 'REG_SEOUL_SEOCHO', 'sigungu', '서울특별시 서초구'),
    (seoul_id, '강남구', 'REG_SEOUL_GANGNAM', 'sigungu', '서울특별시 강남구'),
    (seoul_id, '송파구', 'REG_SEOUL_SONGPA', 'sigungu', '서울특별시 송파구'),
    (seoul_id, '강동구', 'REG_SEOUL_GANGDONG', 'sigungu', '서울특별시 강동구')
    ON CONFLICT (code) DO UPDATE SET
        parent_id = EXCLUDED.parent_id,
        name = EXCLUDED.name,
        level = EXCLUDED.level,
        full_name = EXCLUDED.full_name,
        is_active = true;
END $$;
