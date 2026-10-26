<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Plugin;

use Magento\Framework\App\Area;
use Magento\Framework\App\Request\Http as Request;
use Magento\Framework\View\DesignInterface;
use OOCS\LynxTheme\Model\ThemeFallback;

/**
 * Names the theme those pages render as, at the one place the answer is asked for before anything acts on it
 * @see \Magento\Framework\View\DesignLoader::load()
 * @see \Magento\Store\Model\App\Emulation::startEnvironmentEmulation()
 */
class FallbackDesign
{
    /**
     * Request, fallback
     *
     * @param Request $request
     * @param ThemeFallback $fallback
     */
    public function __construct(
        private readonly Request $request,
        private readonly ThemeFallback $fallback,
    ) {
    }

    /**
     * After Get Configuration Design Theme
     *
     * @param DesignInterface $subject
     * @param string|null $result
     * @param string|null $area
     * @param array $params
     * @return string|null
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterGetConfigurationDesignTheme(
        DesignInterface $subject,
        $result,
        $area = null,
        array $params = []
    ) {
        if ($area !== null && $area !== Area::AREA_FRONTEND) {
            return $result;
        }

        // A store in the parameters means the question is not about the page being rendered
        if (isset($params['store'])) {
            return $result;
        }

        if (!$this->fallback->isActive() || !$this->fallback->matches($this->request->getFullActionName())) {
            return $result;
        }

        return $this->fallback->getThemeId();
    }
}
