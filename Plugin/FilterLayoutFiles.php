<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Plugin;

use Magento\Framework\View\Design\ThemeInterface;
use Magento\Framework\View\Layout\File\Collector\Aggregated;
use OOCS\LynxTheme\Helper\Theme as ThemeHelper;

/**
 * Narrow the layout file search pattern from *.xml to lynx_*.xml when the OOCS/Lynx theme (or a child of it) is
 */
class FilterLayoutFiles
{
    public const FILE_PATTERN = 'lynx_*.xml';

    /**
     * Theme helper
     *
     * @param ThemeHelper $themeHelper
     */
    public function __construct(
        private readonly ThemeHelper $themeHelper,
    ) {
    }

    /**
     * Before Get Files
     *
     * @param Aggregated $subject
     * @param ThemeInterface $theme
     * @param string $filePath
     * @return array{0: ThemeInterface, 1: string}|null
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function beforeGetFiles(Aggregated $subject, ThemeInterface $theme, string $filePath): ?array
    {
        if ($filePath === '*.xml' && $this->themeHelper->isLynxTheme()) {
            return [$theme, self::FILE_PATTERN];
        }

        return null;
    }
}
